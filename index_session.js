
const { Client } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatterSend, phoneNumberFormatterSave, dateNow} = require('./helpers/formatter');
var jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const JWT_KEY = 'S1k0t35d@tc0m';

// parse application/json
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.sendFile('index.html', {root:__dirname});
});

const sessions = [];
const SESSIONS_FILE = './session/sessions.json';

const setSessionsFile = function(sessions){
    fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions), function(err){
        if(err){
            console.log(err);
        }
    });
}

const getSessionsFile = function(){
    return JSON.parse(fs.readFileSync(SESSIONS_FILE));
}

const createClient = function(phone,description) {
    
    console.log('Creating session: ' + phone);
    const SESSION_FILE_PATH = `./session/session-${phone}.json`;
    let sessionCfg;
    if (fs.existsSync(SESSION_FILE_PATH)) {
        sessionCfg = require(SESSION_FILE_PATH);
    }

    const client = new Client({
        qrTimeoutMs: 0,
        restartOnAuthFail: true,
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process', // <- this one doesn't works in Windows
                '--disable-gpu'
            ],
        },
        session: sessionCfg
    });

    client.initialize();

    client.on('qr', (qr) => {
        // console.log('QR RECEIVED', qr);
        qrcode.toDataURL(qr, (err, url) => {
            io.emit('qr', { phone: phone, text: 'scan please!', src: url });
        });
    });

    client.on('ready', async () => {

        if(client.pupPage.isClosed())
        {
            console.log(phone +' Check connection...');
        }
        else
        {
            let picUser = await client.getProfilePicUrl(client.info.wid.user);

            let token = jwt.sign({phone : client.info.wid.user}, JWT_KEY, {expiresIn: '1h'});
    
            io.emit('ready', { phone: phone, text: 'Whatsapp is ready!', picUrl : picUser });
            console.log(phone +' Whatsapp is ready!');
    
            const savedSessions = getSessionsFile();
            const sessionIndex = savedSessions.findIndex(sess => sess.phone == phone);
    
            if(client.info.wid.user!=phone)
            {
                io.emit('message', { phone: phone, text: 'beda nomor', phoneScan : client.info.wid.user });
    
                savedSessions[sessionIndex].ready = false;
            }
            else
            {
                savedSessions[sessionIndex].ready = true;
            }
            
            savedSessions[sessionIndex].token = token;
            setSessionsFile(savedSessions);
        }
    });

    client.on('authenticated', (session) => {
        io.emit('authenticated', { phone: phone, text: 'Process authenticated!' });
        sessionCfg = session;
        fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
            if (err) {
                console.error(err);
            }
        });
    });

    client.on('auth_failure', function(session) {
        io.emit('auth_failure', { phone: phone, text: 'Auth failure, restarting...' });

        console.log(phone +' Auth failure, restarting...!');
    });

    client.on('disconnected', (reason) => {
        io.emit('disconnected', { phone: phone, text: 'Whatsapp is disconnected!' });
        
        console.log(phone +' Whatsapp disconnected!');

        fs.unlinkSync(SESSION_FILE_PATH, function(err) {
            if(err) return console.log(err);
            console.log('Session file deleted!');
        });

        client.destroy();
        client.initialize();

        // menghapus pada file sessions
        const savedSessions = getSessionsFile();
        const sessionIndex = savedSessions.findIndex(sess => sess.phone == phone);
        savedSessions[sessionIndex].ready = false;
        savedSessions[sessionIndex].token = '';
        setSessionsFile(savedSessions);

    });

    // Tambahkan client ke sessions
    sessions.push({
        phone: phone,
        description: description,
        client: client
    });

    // Menambahkan session ke file
    const savedSessions = getSessionsFile();
    const sessionIndex = savedSessions.findIndex(sess => sess.phone == phone);

    if (sessionIndex == -1) {
        savedSessions.push({
            phone: phone,
            description: description,
            ready: false,
            token: ''
        });
        setSessionsFile(savedSessions);
    }
}

const init = function(socket) {
    
    const savedSessions = getSessionsFile();

    if (savedSessions.length > 0) {
        if (socket) {            
            socket.emit('list_phone', savedSessions);
        } 
        else {
            savedSessions.forEach(sess => {
                createClient(sess.phone, sess.description);
            });
        }
    }
}

const authenticate = (req, res, next) => {
    const authHeader = req.headers['x-api-key'];

    if (authHeader) {

        if(JWT_KEY==authHeader)
        {
            const arr_token = [];
            const savedSessions = getSessionsFile();
            savedSessions.forEach(sess => {
                arr_token.push(sess.token);
            });

            const token = arr_token[Math.floor(Math.random()*arr_token.length)];

            jwt.verify(token, JWT_KEY, async (err, decoded) => {
                if (err) {
                    if(err.name === 'TokenExpiredError'){
                        res.status(403).json({
                            code: 403,
                            status: 'fail',
                            message: {
                                Auth: 'Token expired'
                            }
                        });
                    }
                    else if(err.name === 'JsonWebTokenError'){
                        res.status(403).json({
                            code: 403,
                            status: 'fail',
                            message: {
                                Auth: 'Token is not defined'
                            }
                        });
                    }
                    else{
                        res.status(403).json({
                            code: 403,
                            status: 'fail',
                            message: {
                                Auth: err.name
                            }
                        });
                    }
                }

                if(decoded){

                    let phone_sender = decoded.phone;
                    
                    const checkClient = savedSessions.findIndex(sess => sess.phone_sender == phone_sender);

                    if(checkClient == 0){
                        res.status(403).json({
                            code: 403,
                            status: 'fail',
                            message: {
                                Sender: `Whatsapp number ${phone_sender} is not registered`
                            }
                        });
                    }
                    else{

                        req.sender = phone_sender;
                        next();
                    }
                }
            });
        }
        else
        {
            return res.status(422).json({
                status: 'fail',
                message: {
                    send_message: 'KEY are not the same at server'
                }
            });
        }
    } 
    else {
        res.status(401).json({
            code: 401,
            status: 'fail',
            message: {
                Auth: 'KEY not found'
            }
        });
    }
};

init();

// socket IO
io.on('connection', function(socket) {

    init(socket);

    socket.on('create-client', (data) => {    
        createClient(phoneNumberFormatterSave(data.clientNumber), data.clientDescription);
    });
});

// Send message
app.post('/v1/send-message',  [
    body('number').notEmpty(),
    body('message').notEmpty(),
], authenticate, async (req, res) => {

    const errors = validationResult(req).formatWith(({ msg }) => {
        return msg;
    });

    if(!errors.isEmpty()){
        return res.status(422).json({
            status: 'fail',
            message: errors.mapped(),
            data: null
        });
    }

    const sender = req.sender;
    const number = phoneNumberFormatterSend(req.body.number);
    const message = req.body.message;

    const client = sessions.find(sess => sess.phone == sender).client;

    // const isRegisteredNumber = await client.isRegisteredUser(number);
    // const isConnection = await client.getState();

    // if(isConnection!='CONNECTED')
    // {
    //     return res.status(422).json({
    //         status: 'fail',
    //         message: {
    //             send_message: `The number ${sender} is not connected`
    //         }
    //     });
    // }
   
    // if(!isRegisteredNumber){
    //     return res.status(422).json({
    //         status: 'fail',
    //         message: {
    //             send_message: 'The number is not registered'
    //         }
    //     });
    // }

    client.sendMessage(number, message).then(response => {
        
        console.log(phoneNumberFormatterSave(req.body.number)+' : WhatsApp message sent successfully from number '+sender);

        res.status(200).json({
            status: 'success',
            message: {
                send_message: 'WhatsApp message sent successfully from number '+sender
            }
        });
    }).catch(err => {
        res.status(200).json({
            status: 'fail',
            message: {
                send_message: 'WhatsApp message failed to send from number '+sender
            }
        });
    });
});

//Server listening
server.listen(8000, function(){
    console.log('api whatsapp running on *:' + 8000);
});