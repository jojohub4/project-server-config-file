const app = require('express')();
const mysql = require(mysql2);
const bodyParser = require('body-parser');
const { error } = require('console');
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

    const query = `SELECT first_name, last_name, role, course, year, semester 
                   FROM users WHERE email = ? AND registration_no = ?`;

    connection.query(query, [email, registration_no], (err, results) => {
        if (err) {
            console.error('Database query error:', err);
            return res.status(500).json({ success: false, error: 'Database query error' });
        }
        if (results.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const user = results[0];

        console.log(`User found: ${user.first_name} (${user.role})`);
        console.log(`Year: ${user.year}, Semester: ${user.semester}`);
        console.log(`Checking courses with: course_name='${user.course}', year=${user.year}, semester=${user.semester}`);

        // ✅ Define the response object
        const response = {
            success: true,
            first_name: user.first_name,
            last_name: user.last_name,
            role: user.role,
            email,
            registration_no
        };

        if (user.role === 'student') {
            const studentQuery = `SELECT unit_code, unit_name 
                                  FROM courses 
                                  WHERE course_name = ? AND year = ? AND semester = ?`;

            connection.query(studentQuery, [user.course, user.year, user.semester], (err, courseResults) => {
                if (err) {
                    console.error('Student Query Error:', err);
                    return res.status(500).json({ success: false, error: 'Database query error' });
                }
                console.log(`Found courses for ${user.course} Year ${user.year} Semester ${user.semester}:`, courseResults);
                response.courses = courseResults;  // ✅ Now response is defined
                return res.json(response);
            });

        } else if (user.role === 'lecturer') {
                        const lecturerQuery = `
                SELECT c.unit_code, c.unit_name 
                FROM lecturer_units lu
                JOIN courses c ON lu.unit_code = c.unit_code
                WHERE lu.lecturer_email = ?;
            `;

            connection.query(lecturerQuery, [email], (err, unitResults) => {
                if (err) {
                    console.error('Lecturer Query Error:', err);
                    return res.status(500).json({ success: false, error: 'Database query error' });
                }
                response.units = unitResults;
                return res.json(response);
            });

        } else {
            return res.status(400).json({ success: false, error: 'Invalid user role' });
        }
    });
});

// Add the attendance record endpoint
app.post('/api/attendance/record', (req, res) => {
    const { registration_no, email, first_name, unitCode, unitName, action, timestamp } = req.body;

    // Convert the provided timestamp to date and time
    const date = new Date(parseInt(timestamp, 10));
    const offset = date.getTimezoneOffset() * 60000; // Adjust for timezone offset
    const localDate = new Date(date.getTime() - offset + 3 * 3600000); // Add timezone offset (if necessary)
    
    // Extract the date and time separately
    const formattedDate = localDate.toISOString().split('T')[0]; // e.g., '2025-01-25'
    const formattedTime = localDate.toISOString().split('T')[1].split('.')[0]; // e.g., '08:00:00'

    // Update the query for the separate date and time columns
    const query = `
        INSERT INTO attendance (registration_no, email, first_name, unitCode, unitName, action, date, time) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    connection.query(query, [registration_no, email, first_name, unitCode, unitName, action, formattedDate, formattedTime], (err, result) => {
        if (err) {
            console.error('Error saving attendance record:', err);
            return res.status(500).json({ success: false, message: 'Failed to record attendance' });
        }
        res.status(200).json({ success: true, message: 'Attendance recorded successfully' });
    });
});

//get attendance logs
app.get('/api/attendance/logs', (req, res) => {
    const email = req.query.email;
    const registration_no = req.query.registration_no;
    const fromDate = req.query.fromDate;
    const toDate = req.query.toDate;

    console.log('received api request with parameters:');
    console.log('Email:', email);
    console.log('registration no:', registration_no);
    console.log('from date:', fromDate);
    console.log('to date:', toDate);

    if (!email || !registration_no || !fromDate || !toDate){
        console.log('missing parameters');
        return res.status(400).json({success: false, error: 'missing required parameters'});
    }

    const formattedFromDate = fromDate.trim();
    const formattedToDate = toDate.trim();

    const query = `SELECT * FROM attendance WHERE registration_no =? AND date BETWEEN ? AND ?`;
    connection.query(query, [registration_no, formattedFromDate, formattedToDate], (err, results) => {
        if (err) {
            console.error('database error', err);
            return res.status(500).json({ success: false, error: 'databse query error'});
        }

        console.log('returning attendance logs:', results.length);
        res.json({success:true, logs: results.length > 0 ? results : []});
    })
});

app.get('/api/lecturer/units',(req, res) => {
    const {email} = req.query;
    if (!email) {
        return res.status(400).json({success:false, error: 'email is required'});
    }
    const query = `SELECT c.unit_code, c.unit_name
                    FROM lecturer_units lu
                    JOIN courses c ON lu.unit_code = c.unit_code
                    WHERE lu.lecturer_email = ?`;

    connection.query(query, [email], (err, results) => {
        if (err){
            console.error('database query error:', err.message);
            return res.status(500).json({success: false, error: 'database query error', details:err.message});
        }

        if (results.length === 0){
            console.log('no unit found for lecturer: ${email}');
            return res.json({success: true, units: []});
        }
        console.log('found units for  ${email}:', results);
        return res.json({success: true, units: results});
    })
})
app.get('/api/lecturer/attendance', (req, res) => {
    const { unitCode, unitName } = req.query;

    if (!unitCode || !unitName) {
        return res.status(400).json({ success: false, error: 'Missing unitCode or unitName' });
    }

    const query = `
        SELECT 
            COUNT(CASE WHEN a.status = 'present' THEN 1 END) AS present_students,
            COUNT(CASE WHEN a.status = 'absent' THEN 1 END) AS absent_students,
            (SELECT COUNT(*) FROM users WHERE course = (
                SELECT course_name FROM courses WHERE unit_code = ? AND unit_name = ?
            )) AS total_students
        FROM attendance a
        WHERE a.unit_code = ? AND a.unit_name = ?;
    `;

    const studentListQuery = `
        SELECT u.first_name, u.second_name, a.status 
        FROM users u
        LEFT JOIN attendance a ON u.registration_no = a.student_reg_no 
        WHERE a.unit_code = ? AND a.unit_name = ?;
    `;

    connection.query(query, [unitCode, unitName, unitCode, unitName], (err, summaryResults) => {
        if (err) {
            console.error("Database query error:", err.message);
            return res.status(500).json({ success: false, error: "Database query error" });
        }

        connection.query(studentListQuery, [unitCode, unitName], (err, studentResults) => {
            if (err) {
                console.error("Student query error:", err.message);
                return res.status(500).json({ success: false, error: "Database query error" });
            }

            const attendance = summaryResults[0] || { present_students: 0, absent_students: 0, total_students: 0 };
            return res.json({
                success: true,
                unitCode,
                unitName,
                presentStudents: attendance.present_students || 0,
                absentStudents: attendance.absent_students || 0,
                totalStudents: attendance.total_students || 0,
                students: studentResults || [] // List of students with their attendance status
            });
        });
    });
});

app.post('/api/lecturer/clock', (req, res) => {
    const { registration_no, email, first_name, action, timestamp } = req.body; // 🟢 Use firstName

    console.log("Incoming request:", req.body); // Debugging log

    if (!registration_no || !email || !first_name || !action || !timestamp) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const query = `
        INSERT INTO lecturer_clocking (registration_no, email, first_name, action, date, time) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    connection.query(query, [registration_no, email, first_name, action, formattedDate, formattedTime], (err, result) => {
        if (err) {
            console.error("Error saving lecturer clocking:", err);
            return res.status(500).json({ success: false, message: "Failed to record lecturer clocking" });
        }
        res.status(200).json({ success: true, message: "Lecturer clocking recorded successfully" });
    });
});


//start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('server running on http://0.0.0.0:${PORT}');
});