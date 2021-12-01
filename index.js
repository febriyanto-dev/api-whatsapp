
const { Client } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatterSend, phoneNumberFormatterSave, dateNow} = require('./helpers/formatter');
const db = require('./helpers/db');
var jwt = require('jsonwebtoken');
const { response } = require('express');

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

const createClient = async function(phone,description) {

    let sessionCfg;

    let checkClient = await db.checkPhone(phone);
    if(checkClient == 0){
        console.log('Creating client: ' + phone);
        await db.insertClient(phone,description);
    }

    let dataClient = await db.getDataClient(phone);
    if(dataClient[0].sessionCfg){
        sessionCfg = JSON.parse(dataClient[0].sessionCfg);
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
        let picUser = await client.getProfilePicUrl(client.info.wid.user);

        let token = jwt.sign({phone : client.info.wid.user}, JWT_KEY, {expiresIn: '1h'});
        await db.updToken(phone,token);

        io.emit('ready', { phone: phone, text: 'Whatsapp is ready!', picUrl : picUser });
        console.log(phone +' Whatsapp is ready!');

        if(client.info.wid.user!=phone){
            io.emit('message', { phone: phone, text: 'beda nomor', phoneScan : client.info.wid.user });
        }
        else{
            await db.updStatus(phone,'ACTIVE');    
        }
    });

    client.on('authenticated', async (session) => {
        io.emit('authenticated', { phone: phone, text: 'Process authenticated!' });
        sessionCfg = session;
        await db.updSessionCfg(phone,JSON.stringify(session));
    });

    client.on('auth_failure', function(session) {
        // io.emit('message', { phone: phone, text: 'Auth failure, restarting...' });

        console.log('auth_failure : '+session);
    });

    client.on('disconnected', async (reason) => {
        // io.emit('message', { phone: phone, text: 'Whatsapp is disconnected!' });
        
        await db.updDisconnected(phone);

        client.destroy();
        client.initialize();
    });

    client.on('message', async msg => {
        if (msg.body == '!ping') {
            msg.reply('pong');
        }
        else if(msg.body == 'Hai'){
            msg.reply('Hai to, I am sikotes...');
        }
    });

    // Tambahkan client ke sessions
    sessions.push({
        phone: phone,
        description: description,
        client: client
    });
}

const init = async function(socket) {
    
    let list_phone = await db.getListPhone();

    if(socket){
        socket.emit('list_phone', list_phone);
    }
    else{
        if(Array.isArray(list_phone)){
            list_phone.forEach(sess => {
                createClient(sess.phone, sess.description);
            });
        }
    }
        
}

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[1];

        jwt.verify(token, JWT_KEY, async (err, decoded) => {
            if (err) {
                if(err.name === 'TokenExpiredError'){
                    res.status(403).json({
                        code: 403,
                        status: 'fail',
                        message: {
                            Auth: 'Token expired'
                        },
                        data: null
                    });
                }
                else if(err.name === 'JsonWebTokenError'){
                    res.status(403).json({
                        code: 403,
                        status: 'fail',
                        message: {
                            Auth: 'Token is not defined'
                        },
                        data: null
                    });
                }
                else{
                    res.status(403).json({
                        code: 403,
                        status: 'fail',
                        message: {
                            Auth: err.name
                        },
                        data: null
                    });
                }
            }

            if(decoded){
                let checkClient = await db.checkPhone(decoded.phone);
                if(checkClient == 0){
                    res.status(403).json({
                        code: 403,
                        status: 'fail',
                        message: {
                            Sender: `Whatsapp number ${decoded.phone} is not registered`
                        },
                        data: null
                    });
                }
                else{

                    req.sender = decoded.phone;
                    next();
                }
            }
        });
    } 
    else {
        res.status(401).json({
            code: 401,
            status: 'fail',
            message: {
                Auth: 'Token not found'
            },
            data: null
        });
    }
};

init();

// socket IO
io.on('connection', function(socket) {

    init(socket);

    socket.on('create-client', (data) => {    
        createClient(phoneNumberFormatterSave(data.clientNumber),data.clientDescription);
    });
});

//tampilkan semua data product
app.get('/v1/phone', async (req, res) => {

    const listPhone = await db.getListPhone();

    if(listPhone !== false){
        return res.status(200).json({
            status: true,
            message: 'success',
            data: listPhone
        });
    }
    else{
        return res.status(422).json({
            status: true,
            message: 'failed',
            data: null
        });
    }    
});

// Send message
app.post('/v1/send-message',  [
    body('number').notEmpty(),
    body('message').notEmpty(),
], authenticateJWT, async (req, res) => {

    const errors = validationResult(req).formatWith(({ msg }) => {
        return msg;
    });

    if(!errors.isEmpty()){
        return res.status(422).json({
            code: 422,
            status: 'fail',
            message: errors.mapped(),
            data: null
        });
    }

    const sender = req.sender;
    const number = phoneNumberFormatterSend(req.body.number);
    const message = req.body.message;

    const client = sessions.find(sess => sess.phone == sender).client;

    const isRegisteredNumber = await client.isRegisteredUser(number);
   
    if(!isRegisteredNumber){
        return res.status(422).json({
            code: 422,
            status: 'fail',
            message: {
                send_message: 'The number is not registered'
            },
            data: null
        });
    }

    client.sendMessage(number, message).then(response => {

        console.log(number+' : WhatsApp message sent successfully from number '+sender);

        res.status(200).json({
            code: 200,
            status: 'success',
            message: {
                send_message: 'WhatsApp message sent successfully from number '+sender
            },
            data: response
        });
    }).catch(err => {
        res.status(200).json({
            code: 200,
            status: 'fail',
            message: {
                send_message: 'Message not sent'
            },
            data: err
        });
    });
});

//Server listening
server.listen(8000, function(){
    console.log('api whatsapp running on *:' + 8000);
});
   