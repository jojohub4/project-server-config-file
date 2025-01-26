const app = require('express')();
const mysql = require(mysql2);
const bodyParser = require('body-parser');
const cors = require('cors');

const PORT =3000;

app.use(cors());
app.use(bodyParser.json());

//mysql connection
const connection = mysql.createConnection({
    host: 'localhost',
    user: 'root', // Replace with your MySQL username
    password: 'password', // Replace with your MySQL password
    database: 'database' //replace with database name 
})
//connection checking
connection.connect(err => {
    if (err) {
        console.error('MySQL connection error:', err);
        return;
    }
    console.log('MySQL connected...');
});
// api endpoint to verify email and registration number
app.post('/api/login', (req, res) => {
    const { email, registration_no } = req.body;

    if (!email || !registration_no) {
        return res.status(400).json({ success: false, error: 'Email and registration number are required' });
    }

    const query = 'SELECT first_name, second_name, level, course, yr, semester FROM students WHERE email = ? AND registration_no = ?';
    connection.query(query, [email, registration_no], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: 'Database query error' });
        }

        if (results.length > 0) {
            const student = results[0];
            const response = {
                success: true,
                first_name: student.first_name,
                second_name: student.second_name,
                level: student.level,
                course: student.course,
                yr: student.yr,
                semester: student.semester,
                courses: []
            };
             // Fetch the courses for the student
             const courseQuery = 'SELECT unit_code, unit_name FROM course WHERE course_name = ? AND yr = ? AND semester = ?';
             connection.query(courseQuery, ['DSE Y' + student.yr + 'S' + student.semester, student.yr, student.semester], (err, courseResults) => {
                if (err) {
                    return res.status(500).json({ success: false, error: 'Database query error' });
                }

                response.courses = courseResults;
                return res.json(response);
            });
        } else {
            return res.status(404).json({ success: false, error: 'Student not found' });
        }
    });
});
// Add the attendance record endpoint
app.post('/api/attendance/record', (req, res) => {
    const { registration_no, email, firstName, unitCode, unitName, action, timestamp } = req.body;

    // Convert the provided timestamp to date and time
    const date = new Date(parseInt(timestamp, 10));
    const offset = date.getTimezoneOffset() * 60000; // Adjust for timezone offset
    const localDate = new Date(date.getTime() - offset + 3 * 3600000); // Add timezone offset (if necessary)
    
    // Extract the date and time separately
    const formattedDate = localDate.toISOString().split('T')[0]; // e.g., '2025-01-25'
    const formattedTime = localDate.toISOString().split('T')[1].split('.')[0]; // e.g., '08:00:00'

    // Update the query for the separate date and time columns
    const query = `
        INSERT INTO attendance (registration_no, email, firstName, unitCode, unitName, action, date, time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(query, [registration_no, email, firstName, unitCode, unitName, action, formattedDate, formattedTime], (err, result) => {
        if (err) {
            console.error('Error saving attendance record:', err);
            return res.status(500).json({ success: false, message: 'Failed to record attendance' });
        }
        res.status(200).json({ success: true, message: 'Attendance recorded successfully' });
    });
});

//get attendance logs
app.get('/api/attendance/logs', (req, res) => {
    const query = `
        SELECT 
            registration_no, 
            email, 
            firstName, 
            unitCode, 
            unitName, 
            MAX(CASE WHEN action = 'in' THEN CONCAT(date, 'T', time) END) AS punchInTime,
            MAX(CASE WHEN action = 'out' THEN CONCAT(date, 'T', time) END) AS punchOutTime
        FROM attendance
        GROUP BY registration_no, email, firstName, unitCode, unitName
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching attendance logs:', err);
            return res.status(500).json({ message: 'Failed to fetch attendance logs' });
        }

        const sanitizedResults = results.map(log => ({
            registration_no: log.registration_no,
            email: log.email,
            firstName: log.firstName,
            unitCode: log.unitCode,
            unitName: log.unitName,
            punchInTime: log.punchInTime || "N/A",
            punchOutTime: log.punchOutTime || "N/A"
        }));

        res.status(200).json(sanitizedResults); // Return the array directly
    });
});

//start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('server running on http://0.0.0.0:${PORT}');
});