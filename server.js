const app = require('express')();
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cors = require('cors');

const PORT =3000;

app.use(cors());
app.use(bodyParser.json());

//mysql connection
require('dotenv').config();

const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

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
                SELECT lu.unit_code, lu.unit_name 
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

        }else if (user.role === 'admin'){
            response.admin_email = email;
            response.adminReg_no = registration_no;
            response.admin_name = user.first_name;
            console.log('admin log in detected: ${user.firstname}');
            return res.json(response);
        }else {
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

    const query = `
            SELECT 
            date, 
            unitCode, 
            unitName, 
            MAX(CASE WHEN action = 'in' THEN time END) AS punchInTime, 
            MAX(CASE WHEN action = 'out' THEN time END) AS punchOutTime,
            TIMEDIFF(
                MAX(CASE WHEN action = 'out' THEN time END),
                MAX(CASE WHEN action = 'in' THEN time END)
            ) AS duration,
            (CASE 
                WHEN MAX(CASE WHEN action = 'in' THEN time END) IS NOT NULL THEN 'Present'
                ELSE 'Absent'
            END) AS status
        FROM attendance
        WHERE registration_no = ? 
        AND date BETWEEN ? AND ?
        GROUP BY date, unitCode, unitName;
        `;
    connection.query(query, [registration_no, formattedFromDate, formattedToDate], (err, results) => {
        if (err) {
            console.error('database error', err);
            return res.status(500).json({ success: false, error: 'databse query error'});
        }

        console.log('returning attendance logs:', results.length);
        res.json({success:true, logs: results.length > 0 ? results : []});
    });
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
    });
});

app.post('/api/clocking', (req, res) => {
    const { registration_no, email, first_name, action, timestamp } = req.body;

    console.log("Clocking request received:", req.body); // Debugging log

    if (!registration_no || !email || !first_name || !action || !timestamp ) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    console.log ('converting timestamp:', timestamp);
    const date = new Date(parseInt(timestamp, 10));
    const offset = date.getTimezoneOffset() * 60000; // Adjust for timezone offset
    const localDate = new Date(date.getTime() - offset + 3 * 3600000); // Add timezone offset (if necessary)

    const formattedDate = localDate.toISOString().split('T')[0]; // e.g., '2025-01-25'
    const formattedTime = localDate.toISOString().split('T')[1].split('.')[0]; // e.g., '08:00:00'

    const query = `
        INSERT INTO lecturer_clocking (registration_no, email, first_name, action, date, time) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    console.log('executing query:', query);

    connection.query(query, [registration_no, email, first_name, action, formattedDate, formattedTime], (err, result) => {
        if (err) {
            console.error("Error saving lecturer clocking:", err);
            return res.status(500).json({ success: false, message: "Failed to record clocking" });
        }
        res.status(200).json({ success: true, message: "Clocking recorded successfully" });
    });
});

app.get('/api/lecturer/attendance', (req, res) => {
    const { email, fromDate, toDate } = req.query;  // Get lecturer email & date range from query params

    if (!email || !fromDate || !toDate) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const query = `
        SELECT lecturer_email, registration_no, first_name, action, date, time
        FROM lecturer_clocking
        WHERE lecturer_email = ? AND date BETWEEN ? AND ?
        ORDER BY date DESC, time DESC
    `;

    connection.query(query, [email, fromDate, toDate], (err, results) => {
        if (err) {
            console.error("Error fetching lecturer attendance:", err);
            return res.status(500).json({ success: false, message: "Database error" });
        }

        if (results.length === 0) {
            return res.status(404).json({ success: false, message: "No records found" });
        }

        res.json({ success: true, logs: results });
    });
});

app.post('/api/admin/clock', (req, res) => {
    const { registration_no, email, first_name, action, timestamp } = req.body;

    console.log("Clocking request received:", req.body); // Debugging log

    if (!registration_no || !email || !first_name || !action || !timestamp ) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const formattedDate = dateObj.toISOString().split('T')[0];
    const formattedTime = dateObj.toISOString().split('T')[1].split('.')[0];

    const query = `
        INSERT INTO admin_clocking (registration_no, email, first_name, action, date, time) 
        VALUES (?, ?, ?, ?, ?, ?)
    `;

    connection.query(query, [registration_no, email, first_name, action, formattedDate, formattedTime], (err, result) => {
        if (err) {
            console.error("Error saving admin clocking:", err);
            return res.status(500).json({ success: false, message: "Failed to record clocking" });
        }
        res.status(200).json({ success: true, message: "Clocking recorded successfully" });
    });
});

app.get('/api/admin/attendance', (req, res) => {
    const { email, registration_no, fromDate, toDate } = req.query;  // Get lecturer email & date range from query params

    if (!email || !registration_no || !fromDate || !toDate) {
        return res.status(400).json({ success: false, message: "Missing required fields" });
    }

    const query = `
        SELECT * FROM admin_clocking
        WHERE email = ? AND registration_no = ? AND date BETWEEN ? AND ?
        ORDER BY date DESC, time DESC
    `;

    connection.query(query, [email, registration_no, fromDate, toDate], (err, results) => {
        if (err) {
            console.error("Error fetching admin attendance:", err);
            return res.status(500).json({ success: false, message: "failed to retrieve records" });
        }

        res.status(200).json({ success: true, logs: results});
    });
});

app.post('/api/support', async (req, res) => {
    const {userEmail, userName, issue} = req.body;

    if (!userEmail || !userName || !issue) {
        return res.status(400).json({success: false, message: 'missing fields'});
    }

    const mailOptions = {
        from: userEmail,
        to: 'developeremail@gmail.com',
        subject: `support request from ${userName}`,
        text: `user: ${userName}\nEmail: ${userEmail}\n\nIssue Description:\n${issue}`
    };

    try {
        await WebTransportError.sendMail(mailOptions);
        res.status(200).json({success: true, message: 'support request sent successfully'});
    } catch (error) {
        res.status(500).json({success: false, message: 'failed to send email', error: error.message});
    }
});
//start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('server running on http://0.0.0.0:${PORT}');
});
