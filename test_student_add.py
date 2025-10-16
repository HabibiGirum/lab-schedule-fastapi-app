from fastapi import HTTPException
from sqlalchemy.orm import Session

# Import from app
from main import SessionLocal, User, Student, StudentCreate, create_student_admin, hash_password


def ensure_admin(db: Session) -> User:
    admin = db.query(User).filter(User.username == "test_admin").first()
    if admin:
        return admin
    admin = User(
        username="test_admin",
        email="test_admin@example.com",
        hashed_password=hash_password("password"),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    db.refresh(admin)
    return admin


def cleanup_student(db: Session, sid: str, email: str) -> None:
    for s in db.query(Student).filter((Student.student_id == sid) | (Student.email == email)).all():
        db.delete(s)
    db.commit()


def run_tests():
    db = SessionLocal()
    try:
        admin = ensure_admin(db)

        # Test data
        name = "Test Student"
        email = "dup_case@example.com"
        sid = "DuP123"

        # Clean any existing remnants
        cleanup_student(db, sid.lower(), email.lower())
        cleanup_student(db, sid, email)

        # 1) Create should succeed
        created = create_student_admin(
            StudentCreate(name=name, email=email, student_id=sid, study=None, department=None, date=None),
            current_user=admin,
            db=db,
        )
        assert created.student_id == sid.lower(), "student_id should be normalized to lowercase"
        assert created.email == email.lower(), "email should be normalized to lowercase"

        # 2) Duplicate by different case should return 409
        try:
            create_student_admin(
                StudentCreate(name=name, email=email.upper(), student_id=sid.upper(), study=None, department=None, date=None),
                current_user=admin,
                db=db,
            )
            raise AssertionError("Expected HTTPException 409 for duplicate student")
        except HTTPException as he:
            assert he.status_code == 409, f"Expected 409, got {he.status_code}: {he.detail}"

        print("OK: create and duplicate checks pass")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()


