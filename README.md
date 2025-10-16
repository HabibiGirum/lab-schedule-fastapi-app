# Computer Lab Scheduler & Live Availability Management System

A comprehensive FastAPI-based system for managing computer lab scheduling and real-time availability tracking. Perfect for educational institutions with limited computer resources and many students.

## Features

### 🖥️ **Computer Management**

- Track 9 computers (easily expandable)
- Real-time status updates (Available, In Use, Maintenance)
- Live user tracking
- Visual lab layout with color-coded status

### 👥 **Student Management**

- Student registration and profile management
- Student ID and email tracking
- Easy student lookup for bookings

### 📅 **Scheduling System**

- Advanced booking system with conflict detection
- Time slot management
- Booking status tracking (Scheduled, Active, Completed, Cancelled)
- Upcoming bookings calendar view

### ⚡ **Real-time Updates**

- WebSocket-based live updates
- Instant status changes across all connected clients
- Connection status indicator
- Auto-reconnection on connection loss

### 📊 **Dashboard & Analytics**

- Lab status overview with statistics
- Available/In Use/Maintenance counters
- Visual computer grid layout
- Upcoming bookings table

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Initialize Database with Sample Data

```bash
python init_db.py
```

### 3. Start the Application

```bash
python main.py
```

### 4. Access the System

Open your browser and go to: `http://localhost:8000`

## System Architecture

### Backend (FastAPI)

- **Database**: SQLite with SQLAlchemy ORM
- **API**: RESTful endpoints for all operations
- **WebSocket**: Real-time communication
- **Models**: Computer, Student, Booking entities

### Frontend (HTML/CSS/JavaScript)

- **UI Framework**: Bootstrap 5
- **Icons**: Font Awesome
- **Real-time**: WebSocket client
- **Responsive**: Mobile-friendly design

### Database Schema

```
Computers Table:
- id (Primary Key)
- name (Unique)
- status (available/in_use/maintenance)
- current_user
- last_updated

Students Table:
- id (Primary Key)
- name
- email (Unique)
- student_id (Unique)

Bookings Table:
- id (Primary Key)
- computer_id (Foreign Key)
- student_id (Foreign Key)
- start_time
- end_time
- status (scheduled/active/completed/cancelled)
- created_at
```

## API Endpoints

### Computers

- `GET /api/computers` - List all computers
- `POST /api/computers` - Add new computer
- `PUT /api/computers/{id}/status` - Update computer status

### Students

- `GET /api/students` - List all students
- `POST /api/students` - Add new student

### Bookings

- `GET /api/bookings` - List all bookings
- `POST /api/bookings` - Create new booking

### System

- `GET /api/lab-status` - Get complete lab status
- `WebSocket /ws` - Real-time updates

## Usage Examples

### Adding a Student

1. Click "Add Student" button
2. Fill in name, email, and student ID
3. Click "Add Student"

### Creating a Booking

1. Click "New Booking" button
2. Select computer and student
3. Choose start and end times
4. Click "Create Booking"

### Updating Computer Status

1. Click on any computer card
2. Select new status (Available/In Use/Maintenance)
3. If "In Use", enter current user name
4. Click "Update Status"

## Sample Data

The initialization script creates:

- **9 computers** (PC-01 through PC-09)
- **15 sample students** with realistic data
- **Multiple bookings** for today and tomorrow
- **Active sessions** showing current usage

## Customization

### Adding More Computers

1. Use the "Add Computer" button in the UI, or
2. Modify the `computer_names` list in `init_db.py`

### Changing Time Slots

- Default booking duration is 1 hour
- Modify the `timedelta(hours=1)` in booking creation
- Update the UI to reflect different slot durations

### Styling

- Modify `/static/css/style.css` for custom styling
- Update color schemes in the CSS variables
- Customize the Bootstrap theme

## Technical Details

### Real-time Updates

- WebSocket connection for instant updates
- Automatic reconnection on connection loss
- Broadcast updates to all connected clients
- Connection status indicator

### Conflict Detection

- Prevents double-booking of computers
- Validates time slot availability
- Checks for overlapping bookings

### Data Validation

- Pydantic models for request validation
- Database constraints for data integrity
- Error handling with user-friendly messages

## Deployment

### Development

```bash
python main.py
```

### Production (with Uvicorn)

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Docker (Optional)

Create a `Dockerfile` and `docker-compose.yml` for containerized deployment.

## Future Enhancements

- [ ] Email notifications for bookings
- [ ] Mobile app integration
- [ ] Advanced reporting and analytics
- [ ] Integration with university systems
- [ ] QR code check-in/check-out
- [ ] Automated session timeouts
- [ ] Booking cancellation API
- [ ] Multi-lab support
- [ ] Admin user roles
- [ ] Booking history and statistics

## Troubleshooting

### Common Issues

1. **Port already in use**: Change port in `main.py` or kill existing process
2. **Database locked**: Ensure no other instance is running
3. **WebSocket connection failed**: Check firewall settings
4. **Sample data not loading**: Run `python init_db.py` again

### Logs

- Check console output for error messages
- WebSocket connection status shown in UI
- API errors returned as JSON responses

## License

This project is open source and available under the MIT License.

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review the API documentation at `/docs`
3. Examine the sample data structure
4. Test with the provided sample data

---

**Happy Scheduling!** 🎓💻
