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

    const date = new Date(parseInt(timestamp,10));
    const offset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() -offset + 3 * 3600000);
    const formattedTimestamp = localDate.toISOString().slice(0, 19).replace('T', ' ');

    const query = 'INSERT INTO attendance (registration_no, email, firstName, unitCode, unitName, action, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)';

    connection.query(query, [registration_no, email, firstName, unitCode, unitName, action, formattedTimestamp], (err, result) => {
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
            first_name, 
            unitCode, 
            unitName, 
            MAX(CASE WHEN action = 'in' THEN timestamp END) As punchInTime,
            MAX(CASE WHEN action = 'out' THEN timestamp END) As punchOutTime,
        FROM attendance
        GROUP BY registratio_no, email, firt_name, unitCode, unitName
    `;

    connection.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching attendance logs:', err);
            return res.status(500).json({ success: false, message: 'Failed to fetch attendance logs' });
        }

        // add a fallback for missing or invalid fields
        const sanitizedResults = results.map((log) =>{
            if (!log.punchInTime || !log.punchOutTime){
                log.punchInTime = 'N/A';
                log.punchOutTime = 'N/A';
            }
            return log;
        });

        res.status(200).json(sanitizedResults);
        
        const logs = [];
        const logMap = {};

        // Process logs to group them by `registration_no`, `unitCode`, and `unitName`
        results.forEach(log => {
            const key = `${log.registration_no}-${log.unitCode}-${log.unitName}`;
            if (!logMap[key]) {
                logMap[key] = { 
                    date: log.punchTime.split('T')[0], 
                    registration_no: log.registration_no, 
                    email: log.email, 
                    firstName: log.firstName, 
                    unitCode: log.unitCode, 
                    unitName: log.unitName, 
                    punchInTime: null, 
                    punchOutTime: null 
                };
                logs.push(logMap[key]);
            }
            
            if (log.action === 'in') {
                logMap[key].punchInTime = log.punchTime;
            } else if (log.action === 'out') {
                logMap[key].punchOutTime = log.punchTime;
            }
        });

        // Calculate duration and status
        logs.forEach(log => {
            if (log.punchInTime && log.punchOutTime) {
                const punchIn = new Date(log.punchInTime);
                const punchOut = new Date(log.punchOutTime);
                const durationMinutes = Math.round((punchOut - punchIn) / 60000); // Convert ms to minutes
                log.duration = `${Math.floor(durationMinutes / 60)} hrs ${durationMinutes % 60} mins`;
                log.status = durationMinutes >= 90 ? 'Present' : 'Late';
            } else {
                log.duration = 'Incomplete';
                log.status = 'Incomplete';
            }
        });

        res.status(200).json({ success: true, logs });
    });
});
//start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('server running on http://0.0.0.0:${PORT}');
});