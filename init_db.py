#!/usr/bin/env python3
"""
Database initialization script for Computer Lab Scheduler
This script creates sample data for testing the system.
"""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from main import Base, Computer, Student, Booking, User, hash_password
from datetime import datetime, timedelta
import random

# Database setup
SQLALCHEMY_DATABASE_URL = "sqlite:///./lab_scheduler.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_sample_data():
    """Create sample computers, students, and bookings"""
    
    # Create tables
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Check if data already exists
        if db.query(User).count() > 0:
            print("Sample data already exists. Skipping initialization.")
            return
        
        # Create sample users
        users_data = [
            {"username": "admin", "email": "admin@university.edu", "password": "admin123", "role": "admin"},
            {"username": "student", "email": "student@university.edu", "password": "student123", "role": "student"},
            {"username": "john_doe", "email": "john.doe@university.edu", "password": "password123", "role": "student"},
            {"username": "jane_smith", "email": "jane.smith@university.edu", "password": "password123", "role": "student"},
        ]
        
        users = []
        for user_data in users_data:
            user = User(
                username=user_data["username"],
                email=user_data["email"],
                hashed_password=hash_password(user_data["password"]),
                role=user_data["role"]
            )
            db.add(user)
            users.append(user)
        
        db.commit()
        
        # Create 9 computers
        computer_names = [
            "PC-01", "PC-02", "PC-03", "PC-04", "PC-05",
            "PC-06", "PC-07", "PC-08", "PC-09"
        ]
        
        computers = []
        for name in computer_names:
            computer = Computer(
                name=name,
                status=random.choice(["available", "available", "available", "in_use"]),  # Mostly available
                current_user=None,
                last_updated=datetime.utcnow()
            )
            db.add(computer)
            computers.append(computer)
        
        # Create sample students
        students_data = [
            {"name": "Alice Johnson", "email": "alice.johnson@university.edu", "student_id": "STU001", "user_id": users[1].id},
            {"name": "Bob Smith", "email": "bob.smith@university.edu", "student_id": "STU002", "user_id": users[2].id},
            {"name": "Carol Davis", "email": "carol.davis@university.edu", "student_id": "STU003", "user_id": users[3].id},
            {"name": "David Wilson", "email": "david.wilson@university.edu", "student_id": "STU004"},
            {"name": "Eva Brown", "email": "eva.brown@university.edu", "student_id": "STU005"},
            {"name": "Frank Miller", "email": "frank.miller@university.edu", "student_id": "STU006"},
            {"name": "Grace Lee", "email": "grace.lee@university.edu", "student_id": "STU007"},
            {"name": "Henry Taylor", "email": "henry.taylor@university.edu", "student_id": "STU008"},
            {"name": "Ivy Chen", "email": "ivy.chen@university.edu", "student_id": "STU009"},
            {"name": "Jack Anderson", "email": "jack.anderson@university.edu", "student_id": "STU010"},
            {"name": "Kate Martinez", "email": "kate.martinez@university.edu", "student_id": "STU011"},
            {"name": "Liam Thompson", "email": "liam.thompson@university.edu", "student_id": "STU012"},
            {"name": "Maya Rodriguez", "email": "maya.rodriguez@university.edu", "student_id": "STU013"},
            {"name": "Noah Garcia", "email": "noah.garcia@university.edu", "student_id": "STU014"},
            {"name": "Olivia White", "email": "olivia.white@university.edu", "student_id": "STU015"}
        ]
        
        students = []
        for student_data in students_data:
            student = Student(**student_data)
            db.add(student)
            students.append(student)
        
        db.commit()
        
        # Create some sample bookings
        now = datetime.utcnow()
        
        # Create bookings for today
        for i in range(5):
            start_time = now + timedelta(hours=i+1)
            end_time = start_time + timedelta(hours=1)
            
            booking = Booking(
                computer_id=random.choice(computers).id,
                student_id=random.choice(students).id,
                start_time=start_time,
                end_time=end_time,
                status="scheduled"
            )
            db.add(booking)
        
        # Create some active bookings (currently in use)
        for i in range(2):
            start_time = now - timedelta(minutes=30)
            end_time = now + timedelta(minutes=30)
            
            booking = Booking(
                computer_id=random.choice(computers).id,
                student_id=random.choice(students).id,
                start_time=start_time,
                end_time=end_time,
                status="active"
            )
            db.add(booking)
        
        # Create bookings for tomorrow
        tomorrow = now + timedelta(days=1)
        for i in range(8):
            start_time = tomorrow + timedelta(hours=i+8)  # Starting from 8 AM
            end_time = start_time + timedelta(hours=1)
            
            booking = Booking(
                computer_id=random.choice(computers).id,
                student_id=random.choice(students).id,
                start_time=start_time,
                end_time=end_time,
                status="scheduled"
            )
            db.add(booking)
        
        db.commit()
        
        # Update some computers to show current users
        active_bookings = db.query(Booking).filter(Booking.status == "active").all()
        for booking in active_bookings:
            computer = db.query(Computer).filter(Computer.id == booking.computer_id).first()
            student = db.query(Student).filter(Student.id == booking.student_id).first()
            if computer and student:
                computer.status = "in_use"
                computer.current_user = student.name
                computer.last_updated = datetime.utcnow()
        
        db.commit()
        
        print("✅ Sample data created successfully!")
        print(f"   - {len(users)} users (including admin and students)")
        print(f"   - {len(computers)} computers")
        print(f"   - {len(students)} students")
        print(f"   - {len(active_bookings)} active bookings")
        print(f"   - Multiple scheduled bookings for today and tomorrow")
        print("\n🔐 Demo Login Credentials:")
        print("   Admin: admin / admin123")
        print("   Student: student / student123")
        
    except Exception as e:
        print(f"❌ Error creating sample data: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    create_sample_data()
