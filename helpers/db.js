const mysql = require('mysql2/promise');
const { phoneNumberFormatter, dateNow } = require('./formatter');

const createConnection = async () => {
    return await mysql.createConnection({
        host: '185.229.112.228',
        user: 'u472012301_development_db',
        password: 'Ul#131261',
        database: 'u472012301_development_db'
    });
}

const getListPhone = async () => {

    const connection = await createConnection();
    const [rows] = await connection.execute('SELECT * FROM wa_phone_tbl ORDER BY cid ASC');

    if(rows.length > 0){
        return rows;
    }
    else{
        return false;
    }
}

const checkPhone = async (phone) => {

    const connection = await createConnection();

    const [rows] = await connection.execute('SELECT COUNT(cid) AS total FROM wa_phone_tbl WHERE 1=1 AND phone = ?', [phone]);
    
    return rows[0].total;   
}

const insertClient = async (number,description) => {

    try {
        const connection = await createConnection();

        const [ins] = await connection.execute('INSERT INTO wa_phone_tbl (phone,description) VALUES (?,?)', [number, description]);
        
        return ins;
    }
    catch (error) {
        return console.log(`Could not connect - ${error}`);
    }
}

const getDataClient = async (phone) => {

    const connection = await createConnection();

    const [rows] = await connection.execute('SELECT * FROM wa_phone_tbl WHERE 1=1 AND phone = ?', [phone]);
    
    return rows;   
}

const updSessionCfg = async (phone,sessionCfg) => {

    const connection = await createConnection();

    const [rows] = await connection.execute('UPDATE wa_phone_tbl SET sessionCfg = ? WHERE 1=1 AND phone = ?', [sessionCfg, phone]);
    
    return rows;   
}

const updStatus = async (phone,status) => {

    const connection = await createConnection();

    if(status=='ACTIVE'){
        await connection.execute('UPDATE wa_phone_tbl SET status = ?, start_connect = ? WHERE 1=1 AND phone = ?', [status, dateNow(), phone]);
    }
    else{
        await connection.execute('UPDATE wa_phone_tbl SET status = ?, end_connect = ? WHERE 1=1 AND phone = ?', [status, dateNow(), phone]);
    } 
}

const updToken = async (phone,token) => {

    const connection = await createConnection();

    let sql = `
        UPDATE 
            wa_phone_tbl 
        SET 
            token = ?, 
            start_connect = ? 
        WHERE 
            1=1 
        AND phone = ?
    `;
    await connection.execute(sql, [token, dateNow(), phone]);
    
    return true; 
}

const updDisconnected = async (phone) => {

    const connection = await createConnection();

    let sql = `
        UPDATE 
            wa_phone_tbl 
        SET 
            token = ?, 
            sessionCfg = ?, 
            end_connect = ?, 
            status = ? 
        WHERE 
            1=1 
            AND phone = ?
    `;

    await connection.execute(sql, ['', '', dateNow() , 'INACTIVE', phone]);
    
    return true; 
}

module.exports = {
    createConnection,
    getListPhone,
    checkPhone,
    insertClient,
    getDataClient,
    updSessionCfg,
    updStatus,
    updToken,
    updDisconnected
}