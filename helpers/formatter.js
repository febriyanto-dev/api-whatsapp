const phoneNumberFormatterSend = function(number){
    // 1. menghilangkan karakter selain angka
    let formatted = number.replace(/\D/g, '');

    // 2. menghilangkan angka 0 didepan
    // menggantikan dengan kode negara (62)
    if(formatted.startsWith('0')){
        formatted = '62' + formatted.substr(1);
    }

    if(!formatted.endsWith('@c.us')){
        formatted += '@c.us';
    }

    return formatted;
}

const phoneNumberFormatterSave = function(number){
    // 1. menghilangkan karakter selain angka
    let formatted = number.replace(/\D/g, '');

    // 2. menghilangkan angka 0 didepan
    // menggantikan dengan kode negara (62)
    if(formatted.startsWith('0')){
        formatted = '62' + formatted.substr(1);
    }

    return formatted;
}

const dateNow = function() {
    // current timestamp in milliseconds
    let ts = Date.now();

    let date_ob = new Date(ts);
    let date = date_ob.getDate();
    let month = date_ob.getMonth() + 1;
    let year = date_ob.getFullYear();

    // current hours
    let hours = date_ob.getHours();

    // current minutes
    let minutes = date_ob.getMinutes();

    // current seconds
    let seconds = date_ob.getSeconds();

    return year + "-" + month + "-" + date + " " + hours + ":" + minutes+ ":" + seconds;
}

module.exports = {
    phoneNumberFormatterSend,
    phoneNumberFormatterSave,
    dateNow
}