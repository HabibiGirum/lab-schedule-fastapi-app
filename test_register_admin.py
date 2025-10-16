from main import SessionLocal, User, register_user, UserCreate, hash_password
from sqlalchemy.orm import Session
from fastapi import HTTPException


def cleanup_user(db: Session, username: str, email: str) -> None:
    users = db.query(User).filter((User.username == username) | (User.email == email)).all()
    for u in users:
        db.delete(u)
    db.commit()


def run_tests():
    db = SessionLocal()
    try:
        username = "web_admin_test"
        email = "web_admin_test@example.com"
        cleanup_user(db, username, email)

        created = register_user(UserCreate(username=username, email=email, password="secret"), db=db)
        assert created.role == "admin", f"Expected admin role, got {created.role}"

        # Creating duplicate should fail
        dup_error = None
        try:
            register_user(UserCreate(username=username, email=email, password="secret"), db=db)
        except HTTPException as he:
            dup_error = he
        assert dup_error is not None and dup_error.status_code == 400
        print("OK: register forces admin role and duplicate is rejected")
    finally:
        db.close()


if __name__ == "__main__":
    run_tests()


