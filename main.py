from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect, Request, status
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, ForeignKey, func, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List, Optional
import json
import uuid
import secrets
import string
import random
import pytz
import hashlib
from sqlalchemy.exc import IntegrityError

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./lab_scheduler.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Timezone setup
ADDIS_ABABA_TZ = pytz.timezone('Africa/Addis_Ababa')

def get_current_time():
    """Get current time in Addis Ababa timezone"""
    return datetime.now(ADDIS_ABABA_TZ)

def convert_to_utc(dt):
    """Convert datetime to UTC"""
    if dt.tzinfo is None:
        # Assume it's in Addis Ababa timezone if no timezone info
        dt = ADDIS_ABABA_TZ.localize(dt)
    return dt.astimezone(pytz.UTC)

def convert_from_utc(dt):
    """Convert UTC datetime to Addis Ababa timezone"""
    if dt.tzinfo is None:
        dt = pytz.UTC.localize(dt)
    return dt.astimezone(ADDIS_ABABA_TZ)

def generate_username(name: str) -> str:
    """Generate a username from a name"""
    # Clean the name and create username
    clean_name = ''.join(c.lower() for c in name if c.isalnum())
    if len(clean_name) < 3:
        clean_name = clean_name + "user"
    
    # Add random number to make it unique
    random_num = random.randint(100, 999)
    return f"{clean_name[:8]}{random_num}"

def generate_password(length: int = 8) -> str:
    """Generate a secure password"""
    characters = string.ascii_letters + string.digits
    return ''.join(secrets.choice(characters) for _ in range(length))

def generate_student_id() -> str:
    """Generate a unique student ID"""
    year = datetime.now().year
    random_num = random.randint(1000, 9999)
    return f"STU{year}{random_num}"

# Week helpers for schedule view
def get_monday(date_in_tz: datetime) -> datetime:
    base = date_in_tz.replace(hour=0, minute=0, second=0, microsecond=0)
    weekday = base.weekday()  # Monday=0
    return base - timedelta(days=weekday)

def day_range_in_tz(target_date: datetime) -> (datetime, datetime):
    start = target_date.replace(hour=9, minute=0, second=0, microsecond=0)
    end = target_date.replace(hour=17, minute=0, second=0, microsecond=0)
    # convert to UTC for storage
    return convert_to_utc(start), convert_to_utc(end)

# Database Models
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="student")  # admin, student
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: get_current_time())

class Computer(Base):
    __tablename__ = "computers"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    status = Column(String, default="available")  # available, in_use, maintenance
    current_user = Column(String, nullable=True)
    last_updated = Column(DateTime, default=lambda: get_current_time())
    
    bookings = relationship("Booking", back_populates="computer")

class Student(Base):
    __tablename__ = "students"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    email = Column(String, unique=True, index=True)
    student_id = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    # Optional metadata
    study = Column(String, nullable=True)
    department = Column(String, nullable=True)
    registered_at = Column(DateTime, nullable=True)
    active = Column(Boolean, default=True)
    # Usage tracking
    usage_days_total = Column(Integer, nullable=True)
    usage_days_remaining = Column(Integer, nullable=True)
    usage_last_decrement_at = Column(DateTime, nullable=True)
    
    bookings = relationship("Booking", back_populates="student")

class Booking(Base):
    __tablename__ = "bookings"
    
    id = Column(Integer, primary_key=True, index=True)
    computer_id = Column(Integer, ForeignKey("computers.id"))
    student_id = Column(Integer, ForeignKey("students.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    status = Column(String, default="scheduled")  # scheduled, active, completed, cancelled
    created_at = Column(DateTime, default=lambda: get_current_time())
    
    computer = relationship("Computer", back_populates="bookings")
    student = relationship("Student", back_populates="bookings")

# Create tables and ensure schema compatibility for legacy DBs
Base.metadata.create_all(bind=engine)

def ensure_students_columns():
    """Ensure legacy SQLite DB has new columns used by the ORM model.
    SQLite doesn't auto-migrate existing tables on create_all.
    """
    with engine.connect() as conn:
        try:
            result = conn.execute(text("PRAGMA table_info(students)"))
            columns = [row[1] for row in result.fetchall()]
            if "study" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN study VARCHAR"))
            if "department" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN department VARCHAR"))
            if "registered_at" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN registered_at DATETIME"))
            if "active" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN active BOOLEAN DEFAULT 1"))
            if "usage_days_total" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN usage_days_total INTEGER"))
            if "usage_days_remaining" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN usage_days_remaining INTEGER"))
            if "usage_last_decrement_at" not in columns:
                conn.execute(text("ALTER TABLE students ADD COLUMN usage_last_decrement_at DATETIME"))
        except Exception as e:
            # Do not crash app on migration best-effort issues
            print(f"Schema ensure failed: {e}")

ensure_students_columns()

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Authentication
security = HTTPBasic()

def hash_password(password: str) -> str:
    """Hash a password using SHA-256"""
    return hashlib.sha256(password.encode()).hexdigest()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return hash_password(plain_password) == hashed_password

def get_current_user(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)):
    """Get current authenticated user"""
    user = db.query(User).filter(User.username == credentials.username).first()
    if not user or not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Basic"},
        )
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user

def get_admin_user(current_user: User = Depends(get_current_user)):
    """Ensure current user is an admin"""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Admin access required."
        )
    return current_user

def get_student_user(current_user: User = Depends(get_current_user)):
    """Ensure current user is a student"""
    if current_user.role not in ["student", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Student access required."
        )
    return current_user

# Pydantic models
class UserCreate(BaseModel):
    username: str
    email: str
    password: str
    role: Optional[str] = None  # Ignored; server forces "admin"

class UserCreateSimple(BaseModel):
    name: str
    email: str
    role: Optional[str] = None  # Ignored; server forces admin

class UserCreateResponse(BaseModel):
    id: int
    username: str
    password: str
    email: str
    role: str
    student_id: Optional[str] = None
    
    class Config:
        from_attributes = True

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True

class UserLogin(BaseModel):
    username: str
    password: str

class ComputerCreate(BaseModel):
    name: str

class ComputerResponse(BaseModel):
    id: int
    name: str
    status: str
    current_user: Optional[str]
    last_updated: datetime
    
    class Config:
        from_attributes = True

class StudentCreate(BaseModel):
    name: str
    email: str
    student_id: str
    study: Optional[str] = None
    department: Optional[str] = None
    date: Optional[str] = None  # ISO date string
    usage_days: Optional[int] = None

class StudentResponse(BaseModel):
    id: int
    name: str
    email: str
    student_id: str
    study: Optional[str] = None
    department: Optional[str] = None
    date: Optional[datetime] = None
    active: Optional[bool] = None
    usage_days_total: Optional[int] = None
    usage_days_remaining: Optional[int] = None
    
    class Config:
        from_attributes = True

class BookingCreate(BaseModel):
    computer_id: int
    student_id: int
    start_time: datetime
    end_time: datetime

class StudentBookingCreate(BaseModel):
    computer_id: int
    start_time: str
    end_time: str
    # student_id is not needed for student bookings as it's derived from the authenticated user

class BookingResponse(BaseModel):
    id: int
    computer_id: int
    student_id: int
    start_time: datetime
    end_time: datetime
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class ComputerStatusUpdate(BaseModel):
    computer_id: int
    status: str
    current_user: Optional[str] = None

# FastAPI app
app = FastAPI(title="Computer Lab Scheduler", version="1.0.0")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# WebSocket connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except:
                pass

manager = ConnectionManager()

# API Endpoints
@app.get("/", response_class=HTMLResponse)
def read_root():
    with open("templates/index.html", "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.get("/admin", response_class=HTMLResponse)
def admin_dashboard():
    with open("templates/admin.html", "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.get("/student", response_class=HTMLResponse)
def student_dashboard():
    with open("templates/student.html", "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

@app.get("/register", response_class=HTMLResponse)
def register_page():
    with open("templates/register.html", "r") as f:
        html_content = f.read()
    return HTMLResponse(content=html_content)

# Authentication endpoints
@app.post("/api/auth/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(
        (User.username == user.username) | (User.email == user.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Username or email already registered")
    
    # Create new user
    hashed_password = hash_password(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password,
        role="admin"  # force admin-only role
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.get("/api/auth/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user

# Admin-only endpoints
@app.get("/api/admin/computers", response_model=List[ComputerResponse])
def get_computers_admin(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(Computer).all()

@app.post("/api/admin/computers", response_model=ComputerResponse)
def create_computer_admin(computer: ComputerCreate, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    db_computer = Computer(name=computer.name)
    db.add(db_computer)
    db.commit()
    db.refresh(db_computer)
    return db_computer

@app.get("/api/admin/students", response_model=List[StudentResponse])
def get_students_admin(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(Student).all()

@app.post("/api/admin/students", response_model=StudentResponse)
def create_student_admin(student: StudentCreate, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    # Parse optional date
    reg_at = None
    if student.date:
        try:
            # accept YYYY-MM-DD or ISO
            if len(student.date) == 10:
                y, m, d = map(int, student.date.split("-"))
                reg_at = ADDIS_ABABA_TZ.localize(datetime(y, m, d))
            else:
                reg_at = datetime.fromisoformat(student.date)
        except Exception:
            pass
    # Normalize inputs and check duplicates before insert
    sid = (student.student_id or "").strip().lower()
    email = (student.email or "").strip().lower()
    dup = db.query(Student).filter(
        (func.lower(func.trim(Student.student_id)) == sid) | (func.lower(func.trim(Student.email)) == email)
    ).first()
    if dup:
        # Build a specific message
        detail = "Duplicate student"
        if dup.student_id == sid and dup.email == email:
            detail = "Student ID and email already exist"
        elif dup.student_id == sid:
            detail = "Student ID already exists"
        elif dup.email == email:
            detail = "Email already exists"
        raise HTTPException(status_code=409, detail=detail)
    db_student = Student(
        name=student.name,
        email=email,
        student_id=sid,
        study=student.study,
        department=student.department,
        registered_at=reg_at,
        usage_days_total=student.usage_days if student.usage_days and student.usage_days > 0 else None,
        usage_days_remaining=student.usage_days if student.usage_days and student.usage_days > 0 else None
    )
    try:
        db.add(db_student)
        db.commit()
        db.refresh(db_student)
        return db_student
    except IntegrityError as e:
        db.rollback()
        # Fallback in case race condition on unique constraint
        raise HTTPException(status_code=409, detail="Student ID or email already exists")

@app.post("/api/admin/users/simple", response_model=UserCreateResponse)
def create_user_simple(user: UserCreateSimple, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    try:
        # Generate username and password
        username = generate_username(user.name)
        password = generate_password()
        
        # Ensure username is unique
        counter = 1
        original_username = username
        while db.query(User).filter(User.username == username).first():
            username = f"{original_username}{counter}"
            counter += 1
        
        # Create user
        hashed_password = hash_password(password)
        db_user = User(
            username=username,
            email=user.email,
            hashed_password=hashed_password,
            role="admin"
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)
        
        # No automatic student record creation anymore; admin-only system
        student_id = None
        
        return UserCreateResponse(
            id=db_user.id,
            username=username,
            password=password,
            email=user.email,
            role="admin",
            student_id=student_id
        )
    except Exception as e:
        print(f"Error creating user: {e}")
        raise HTTPException(status_code=500, detail=f"Error creating user: {str(e)}")

@app.get("/api/admin/bookings", response_model=List[BookingResponse])
def get_all_bookings_admin(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return db.query(Booking).order_by(Booking.start_time.desc()).all()

@app.get("/api/admin/bookings/tomorrow", response_model=List[BookingResponse])
def get_tomorrow_bookings_admin(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    tomorrow_start = get_current_time().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    
    return db.query(Booking).filter(
        Booking.start_time >= tomorrow_start,
        Booking.start_time < tomorrow_end
    ).order_by(Booking.start_time).all()

@app.get("/api/admin/users/status")
def get_users_status_admin(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Get all users with their booking status for tomorrow"""
    tomorrow_start = get_current_time().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    
    users = db.query(User).all()
    users_status = []
    
    for user in users:
        # Get student record
        student = db.query(Student).filter(Student.user_id == user.id).first()
        
        # Check if user has bookings tomorrow
        tomorrow_bookings = []
        if student:
            tomorrow_bookings = db.query(Booking).filter(
                Booking.student_id == student.id,
                Booking.start_time >= tomorrow_start,
                Booking.start_time < tomorrow_end
            ).all()
        
        users_status.append({
            "user_id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role,
            "student_name": student.name if student else None,
            "student_id": student.student_id if student else None,
            "has_tomorrow_booking": len(tomorrow_bookings) > 0,
            "tomorrow_bookings": [
                {
                    "id": booking.id,
                    "computer_id": booking.computer_id,
                    "start_time": booking.start_time.isoformat(),
                    "end_time": booking.end_time.isoformat(),
                    "status": booking.status
                } for booking in tomorrow_bookings
            ]
        })
    
    return users_status

# Weekly schedule endpoints (Mon–Fri simple grid)
@app.get("/api/admin/schedule/week")
def get_week_schedule(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    today = get_current_time()
    monday = get_monday(today)
    days = [monday + timedelta(days=i) for i in range(5)]

    students = db.query(Student).order_by(Student.name.asc()).all()
    computers = db.query(Computer).order_by(Computer.name.asc()).all()

    schedule = []
    for student in students:
        row = {"student_id": student.id, "student_name": student.name, "days": []}
        for d in days:
            start_utc, end_utc = day_range_in_tz(d)
            booking = db.query(Booking).filter(
                Booking.student_id == student.id,
                Booking.start_time <= end_utc,
                Booking.end_time >= start_utc,
                Booking.status.in_(["scheduled", "active"]) 
            ).order_by(Booking.start_time.asc()).first()
            if booking:
                row["days"].append({
                    "date": d.date().isoformat(),
                    "has_booking": True,
                    "booking_id": booking.id,
                    "computer_id": booking.computer_id
                })
            else:
                row["days"].append({
                    "date": d.date().isoformat(),
                    "has_booking": False,
                    "booking_id": None,
                    "computer_id": None
                })
        schedule.append(row)

    return {
        "week_start": days[0].date().isoformat(),
        "week_end": days[-1].date().isoformat(),
        "days": [d.strftime("%A") for d in days],
        "computers": [{"id": c.id, "name": c.name} for c in computers],
        "rows": schedule
    }

class ToggleDayPayload(BaseModel):
    student_id: int
    date: str  # ISO date (YYYY-MM-DD)
    computer_id: Optional[int] = None

@app.post("/api/admin/schedule/toggle")
def toggle_day_booking(payload: ToggleDayPayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    # Parse date in Addis Ababa timezone
    try:
        year, month, day = map(int, payload.date.split("-"))
        local_date = ADDIS_ABABA_TZ.localize(datetime(year, month, day))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")

    start_utc, end_utc = day_range_in_tz(local_date)

    # Check existing booking for the student on that day
    existing = db.query(Booking).filter(
        Booking.student_id == payload.student_id,
        Booking.start_time <= end_utc,
        Booking.end_time >= start_utc,
        Booking.status.in_(["scheduled", "active"]) 
    ).first()

    if existing:
        # remove booking
        db.delete(existing)
        db.commit()
        return {"toggled": "removed"}

    # If adding, ensure computer provided
    if not payload.computer_id:
        raise HTTPException(status_code=400, detail="computer_id required to add booking")

    # Ensure computer availability that day
    conflict = db.query(Booking).filter(
        Booking.computer_id == payload.computer_id,
        Booking.start_time < end_utc,
        Booking.end_time > start_utc,
        Booking.status.in_(["scheduled", "active"]) 
    ).count()
    if conflict:
        raise HTTPException(status_code=400, detail="Computer not available for selected day")

    # Create new all-day booking (9:00-17:00 local)
    db_booking = Booking(
        computer_id=payload.computer_id,
        student_id=payload.student_id,
        start_time=start_utc,
        end_time=end_utc,
        status="scheduled"
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return {"toggled": "added", "booking_id": db_booking.id}

# Admin direct assign/unassign to computers (simple immediate use)
class AssignPayload(BaseModel):
    computer_id: int
    student_id: int

@app.post("/api/admin/assign")
def admin_assign(payload: AssignPayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    computer = db.query(Computer).filter(Computer.id == payload.computer_id).first()
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not computer or not student:
        raise HTTPException(status_code=404, detail="Computer or Student not found")
    # Usage expiry check
    if student.usage_days_remaining is not None:
        if student.usage_days_remaining <= 0:
            raise HTTPException(status_code=400, detail="Student's usage days have expired")
    # Block assignment if linked user is inactive
    if student.user_id:
        u = db.query(User).filter(User.id == student.user_id).first()
        if u and not u.is_active:
            raise HTTPException(status_code=400, detail="Student is inactive and cannot be assigned")
    # Fallback: block if student's own active flag is false
    if student.active is False:
        raise HTTPException(status_code=400, detail="Student is inactive and cannot be assigned")
    if computer.status == "in_use":
        raise HTTPException(status_code=400, detail="Computer already in use")
    # Decrement usage days once per calendar day max
    now = get_current_time()
    if student.usage_days_remaining is not None:
        should_decrement = False
        if student.usage_last_decrement_at is None:
            should_decrement = True
        else:
            # Only decrement if new day compared to last decrement (in local tz)
            last = convert_from_utc(student.usage_last_decrement_at) if student.usage_last_decrement_at.tzinfo is None else student.usage_last_decrement_at
            if now.date() > last.date():
                should_decrement = True
        if should_decrement and student.usage_days_remaining > 0:
            student.usage_days_remaining -= 1
            student.usage_last_decrement_at = now
            if student.usage_days_remaining <= 0:
                # Auto mark inactive when days exhausted
                student.active = False
    computer.status = "in_use"
    computer.current_user = student.name
    computer.last_updated = now
    db.commit()
    return {"assigned": True, "usage_days_remaining": student.usage_days_remaining}

class UnassignPayload(BaseModel):
    computer_id: int

@app.post("/api/admin/unassign")
def admin_unassign(payload: UnassignPayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    computer = db.query(Computer).filter(Computer.id == payload.computer_id).first()
    if not computer:
        raise HTTPException(status_code=404, detail="Computer not found")
    computer.status = "available"
    computer.current_user = None
    computer.last_updated = get_current_time()
    db.commit()
    return {"unassigned": True}

# Delete computer (and related bookings)
@app.delete("/api/admin/computers/{computer_id}")
def delete_computer_admin(computer_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    computer = db.query(Computer).filter(Computer.id == computer_id).first()
    if not computer:
        raise HTTPException(status_code=404, detail="Computer not found")
    # Delete related bookings to satisfy FK constraints
    related_bookings = db.query(Booking).filter(Booking.computer_id == computer_id).all()
    for b in related_bookings:
        db.delete(b)
    db.delete(computer)
    db.commit()
    return {"deleted": True}

# Trailing slash variant
@app.delete("/api/admin/computers/{computer_id}/")
def delete_computer_admin_slash(computer_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_computer_admin(computer_id, current_user, db)

class ComputerDeletePayload(BaseModel):
    computer_id: int

@app.post("/api/admin/computers/delete")
def delete_computer_admin_post(payload: ComputerDeletePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_computer_admin(payload.computer_id, current_user, db)

@app.post("/api/admin/computers/delete/")
def delete_computer_admin_post_slash(payload: ComputerDeletePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_computer_admin(payload.computer_id, current_user, db)

# Delete user (and linked student + bookings)
@app.delete("/api/admin/users/{user_id}")
def delete_user_admin(user_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    student = db.query(Student).filter(Student.user_id == user_id).first()
    if student:
        # Delete student's bookings
        student_bookings = db.query(Booking).filter(Booking.student_id == student.id).all()
        for b in student_bookings:
            db.delete(b)
        db.delete(student)
    db.delete(user)
    db.commit()
    return {"deleted": True}

@app.delete("/api/admin/users/{user_id}/")
def delete_user_admin_slash(user_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_user_admin(user_id, current_user, db)

class UserDeletePayload(BaseModel):
    user_id: int

@app.post("/api/admin/users/delete")
def delete_user_admin_post(payload: UserDeletePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_user_admin(payload.user_id, current_user, db)

@app.post("/api/admin/users/delete/")
def delete_user_admin_post_slash(payload: UserDeletePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return delete_user_admin(payload.user_id, current_user, db)

# Students summary for admin table
@app.get("/api/admin/students/summary")
def get_students_summary(current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    students = db.query(Student).order_by(Student.name.asc()).all()
    summary = []
    for s in students:
        # derive date from linked user if exists
        created = None
        # Default to student's own active flag; override with linked user's is_active when present
        is_active = s.active
        if s.user_id:
            u = db.query(User).filter(User.id == s.user_id).first()
            if u and u.created_at:
                created = convert_from_utc(u.created_at) if u.created_at.tzinfo is None else u.created_at
            if u is not None:
                is_active = u.is_active
        # fallback to student's registered_at for created date if still missing
        if not created and s.registered_at:
            created = s.registered_at
        summary.append({
            "id": s.id,
            "name": s.name,
            "email": s.email,
            "study": s.study,
            "department": s.department,
            "date": created.isoformat() if created else None,
            "is_active": is_active,
            "usage_days_total": s.usage_days_total,
            "usage_days_remaining": s.usage_days_remaining
        })
    return summary

@app.post("/api/admin/students/{student_id}/toggle-active")
def toggle_student_active(student_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    # Prefer toggling linked user if present, else toggle student.active flag
    if student.user_id:
        user = db.query(User).filter(User.id == student.user_id).first()
        if user:
            user.is_active = not bool(user.is_active)
            db.commit()
            return {"student_id": student_id, "user_id": user.id, "is_active": user.is_active}
    # Fallback: toggle student's active flag
    student.active = not bool(student.active)
    db.commit()
    return {"student_id": student_id, "user_id": None, "is_active": student.active}

# Trailing slash variant
@app.post("/api/admin/students/{student_id}/toggle-active/")
def toggle_student_active_slash(student_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return toggle_student_active(student_id, current_user, db)

class StudentTogglePayload(BaseModel):
    student_id: int

@app.post("/api/admin/students/toggle-active")
def toggle_student_active_body(payload: StudentTogglePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return toggle_student_active(payload.student_id, current_user, db)

# Usage management
class StudentUsageUpdate(BaseModel):
    days: int  # positive or negative; positive adds days

@app.post("/api/admin/students/{student_id}/usage")
def update_student_usage(student_id: int, payload: StudentUsageUpdate, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if payload.days == 0:
        return {
            "student_id": student_id,
            "usage_days_total": student.usage_days_total,
            "usage_days_remaining": student.usage_days_remaining,
        }
    # Initialize totals if not set
    if student.usage_days_total is None:
        student.usage_days_total = 0
    if student.usage_days_remaining is None:
        student.usage_days_remaining = 0
    student.usage_days_total = max(0, student.usage_days_total + payload.days)
    student.usage_days_remaining = max(0, student.usage_days_remaining + payload.days)
    # If days become positive, mark active
    if student.usage_days_remaining > 0:
        student.active = True
    db.commit()
    return {
        "student_id": student_id,
        "usage_days_total": student.usage_days_total,
        "usage_days_remaining": student.usage_days_remaining,
    }

# Trailing slash variant
@app.post("/api/admin/students/{student_id}/usage/")
def update_student_usage_slash(student_id: int, payload: StudentUsageUpdate, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return update_student_usage(student_id, payload, current_user, db)

class StudentUsageUpdateBody(BaseModel):
    student_id: int
    days: int

@app.post("/api/admin/students/usage")
def update_student_usage_body(payload: StudentUsageUpdateBody, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return update_student_usage(payload.student_id, StudentUsageUpdate(days=payload.days), current_user, db)

@app.post("/api/admin/students/usage/")
def update_student_usage_body_slash(payload: StudentUsageUpdateBody, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return update_student_usage(payload.student_id, StudentUsageUpdate(days=payload.days), current_user, db)

@app.post("/api/admin/students/toggle-active/")
def toggle_student_active_body_slash(payload: StudentTogglePayload, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    return toggle_student_active(payload.student_id, current_user, db)

@app.delete("/api/admin/students/{student_id}")
def delete_student_admin(student_id: int, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    # delete student's bookings
    bookings = db.query(Booking).filter(Booking.student_id == student.id).all()
    for b in bookings:
        db.delete(b)
    # delete linked user if present
    if student.user_id:
        user = db.query(User).filter(User.id == student.user_id).first()
        if user:
            db.delete(user)
    db.delete(student)
    db.commit()
    return {"deleted": True}

@app.put("/api/admin/computers/{computer_id}/status")
def update_computer_status_admin(computer_id: int, status_update: ComputerStatusUpdate, current_user: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    computer = db.query(Computer).filter(Computer.id == computer_id).first()
    if not computer:
        raise HTTPException(status_code=404, detail="Computer not found")
    
    computer.status = status_update.status
    computer.current_user = status_update.current_user
    computer.last_updated = get_current_time()
    
    # Update booking status if computer is being used
    if status_update.status == "in_use":
        active_booking = db.query(Booking).filter(
            Booking.computer_id == computer_id,
            Booking.status == "scheduled",
            Booking.start_time <= datetime.utcnow(),
            Booking.end_time >= datetime.utcnow()
        ).first()
        
        if active_booking:
            active_booking.status = "active"
    
    db.commit()
    
    # Broadcast update to all connected clients
    import asyncio
    import threading
    
    def broadcast_message():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(manager.broadcast(json.dumps({
                "type": "computer_status_update",
                "computer_id": computer_id,
                "status": status_update.status,
                "current_user": status_update.current_user,
                "timestamp": get_current_time().isoformat()
            })))
            loop.close()
        except Exception as e:
            print(f"Error broadcasting message: {e}")
    
    # Run broadcast in a separate thread
    threading.Thread(target=broadcast_message, daemon=True).start()
    
    return {"message": "Computer status updated successfully"}

# Student endpoints
@app.get("/api/student/computers", response_model=List[ComputerResponse])
def get_computers_student(current_user: User = Depends(get_student_user), db: Session = Depends(get_db)):
    return db.query(Computer).all()

@app.get("/api/student/bookings", response_model=List[BookingResponse])
def get_student_bookings(current_user: User = Depends(get_student_user), db: Session = Depends(get_db)):
    # Get student record
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    
    return db.query(Booking).filter(Booking.student_id == student.id).all()

@app.get("/api/student/bookings/tomorrow", response_model=List[BookingResponse])
def get_student_tomorrow_bookings(current_user: User = Depends(get_student_user), db: Session = Depends(get_db)):
    # Get student record
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    
    tomorrow_start = get_current_time().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    
    return db.query(Booking).filter(
        Booking.student_id == student.id,
        Booking.start_time >= tomorrow_start,
        Booking.start_time < tomorrow_end
    ).order_by(Booking.start_time).all()

@app.get("/api/student/dashboard")
def get_student_dashboard(current_user: User = Depends(get_student_user), db: Session = Depends(get_db)):
    """Get comprehensive dashboard data for student"""
    # Get student record
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student profile not found")
    
    # Get all bookings
    all_bookings = db.query(Booking).filter(Booking.student_id == student.id).order_by(Booking.start_time.desc()).all()
    
    # Get tomorrow's bookings
    tomorrow_start = get_current_time().replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    tomorrow_end = tomorrow_start + timedelta(days=1)
    tomorrow_bookings = db.query(Booking).filter(
        Booking.student_id == student.id,
        Booking.start_time >= tomorrow_start,
        Booking.start_time < tomorrow_end
    ).order_by(Booking.start_time).all()
    
    # Get available computers
    computers = db.query(Computer).all()
    
    return {
        "student": {
            "id": student.id,
            "name": student.name,
            "email": student.email,
            "student_id": student.student_id
        },
        "computers": computers,
        "all_bookings": all_bookings,
        "tomorrow_bookings": tomorrow_bookings,
        "has_tomorrow_bookings": len(tomorrow_bookings) > 0,
        "total_bookings": len(all_bookings)
    }

@app.post("/api/student/bookings", response_model=BookingResponse)
def create_booking_student(booking: StudentBookingCreate, current_user: User = Depends(get_student_user), db: Session = Depends(get_db)):
    # Get student record - if not found, create one
    student = db.query(Student).filter(Student.user_id == current_user.id).first()
    if not student:
        # Create a student record for the user
        student = Student(
            name=current_user.username,
            email=current_user.email,
            student_id=f"STU{current_user.id:03d}",
            user_id=current_user.id
        )
        db.add(student)
        db.commit()
        db.refresh(student)
    
    # Convert datetime strings to timezone-aware datetime objects
    try:
        # Handle datetime-local format (YYYY-MM-DDTHH:MM)
        if 'T' in booking.start_time and len(booking.start_time) == 16:
            start_time = datetime.strptime(booking.start_time, '%Y-%m-%dT%H:%M')
            end_time = datetime.strptime(booking.end_time, '%Y-%m-%dT%H:%M')
        else:
            # Handle ISO format
            start_time = datetime.fromisoformat(booking.start_time.replace('Z', '+00:00'))
            end_time = datetime.fromisoformat(booking.end_time.replace('Z', '+00:00'))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid datetime format: {str(e)}")
    
    # Convert to UTC for storage
    start_time_utc = convert_to_utc(start_time)
    end_time_utc = convert_to_utc(end_time)
    
    # Check if computer is available for the requested time
    conflicting_bookings = db.query(Booking).filter(
        Booking.computer_id == booking.computer_id,
        Booking.status.in_(["scheduled", "active"]),
        Booking.start_time < end_time_utc,
        Booking.end_time > start_time_utc
    ).count()
    
    if conflicting_bookings > 0:
        raise HTTPException(status_code=400, detail="Computer is not available for the requested time slot")
    
    db_booking = Booking(
        computer_id=booking.computer_id,
        student_id=student.id,
        start_time=start_time_utc,
        end_time=end_time_utc
    )
    db.add(db_booking)
    db.commit()
    db.refresh(db_booking)
    return db_booking

# Public endpoints (no authentication required)
@app.get("/api/computers", response_model=List[ComputerResponse])
def get_computers(db: Session = Depends(get_db)):
    return db.query(Computer).all()

@app.get("/api/lab-status")
def get_lab_status(db: Session = Depends(get_db)):
    computers = db.query(Computer).all()
    bookings = db.query(Booking).filter(
        Booking.status.in_(["scheduled", "active"]),
        Booking.start_time <= get_current_time() + timedelta(hours=24),
        Booking.end_time >= get_current_time()
    ).all()
    
    return {
        "computers": computers,
        "upcoming_bookings": bookings,
        "timestamp": get_current_time().isoformat()
    }

# WebSocket endpoint for real-time updates
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Echo back the received data (for testing)
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/test-auth")
def test_auth(credentials: HTTPBasicCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        user = db.query(User).filter(User.username == credentials.username).first()
        if not user:
            return {"error": "User not found", "username": credentials.username}
        
        if not verify_password(credentials.password, user.hashed_password):
            return {"error": "Invalid password", "username": credentials.username}
        
        return {"success": True, "user": {"id": user.id, "username": user.username, "role": user.role}}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
