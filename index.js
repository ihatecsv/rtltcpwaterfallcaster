// Start config
const port = 3000;
const host = "127.0.0.1";
const recvCountMax = 100;
const byteLengthMaxToShow = 32;
const startupDataDelay = 50;
// End config

const net = require("net");
const client = new net.Socket();

const sampleRate = Buffer.from([0x02,0x00,0x03,0xD0,0x90]); // 250 KHz
const frequency = Buffer.from([0x01,0x06,0x40,0xA5,0xA0]); // 104.9 MHz
const rtlAgcMode = Buffer.from([0x08,0x00,0x00,0x00,0x00]); // RTL AGC mode auto
const gainMode = Buffer.from([0x08,0x00,0x00,0x00,0x00]); // Gain mode auto
const agcMode = Buffer.from([0x0D,0x00,0x00,0x00,0x00]); // AGC mode auto
const gainValue = Buffer.from([0x04,0x00,0x00,0x00,0x3C]); // Tuner gain 0x3C

const startupData = [sampleRate, frequency, rtlAgcMode, gainMode, agcMode, gainValue];

let recvCount = 0;

const writeStartupData = function(i = 0){
    client.write(startupData[i]);
    if(i == startupData.length - 1) return;
    setTimeout(function(){
        writeStartupData(i + 1);
    }, startupDataDelay);
}

client.connect(port, host, function() {
	console.log("Connected!");
    writeStartupData();
});

client.on("data", function(data) {
    recvCount++;
    const byteLength = Buffer.byteLength(data);
	console.log("Received " + byteLength + " bytes!" + (byteLength > byteLengthMaxToShow ? " (Data too long)" : " (" + data.toString("hex") + ")"));
    if(recvCount >= recvCountMax){
        console.log("Client destroyed, reached max recv count!");
        client.destroy();
    }
});

client.on("close", function() {
	console.log("Connection closed");
});