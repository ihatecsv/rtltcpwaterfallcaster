// CONFIG

// Server
const host = "127.0.0.1"; // rtl_tcp server host
const port = 3000; // rtl_tcp server port

// Radio
const sampleRate = 250000; // Sample rate in Hz
const frequency = 104900000; // Frequency in Hz
const gain = 60; // Gain in dB

// Debug
const recvCountMax = 100; // Max full buffers before exit
const byteLengthMaxToShow = 32; // Max buffer length to show
const startupDataDelay = 50; // Delay between sending startup params

// END CONFIG

const net = require("net");
const client = new net.Socket();

const prefixedBufferFromValue = function(prefix, value, length = 5){
    if(length <= 0) throw new Error("Cannot use lengths less than 1!");
    let position = length - 1;
    const dataArray = new Array(length).fill(0);
    dataArray[0] = prefix;
    while(value != 0){
        dataArray[position] = value & 0xFF;
        value >>>= 8;
        position--;
        if(position < 0) throw new Error("Data is too large to fit length " + length + "!");
    }
    return Buffer.from(dataArray);
}

const sampleRateData = prefixedBufferFromValue(0x02, sampleRate);
const frequencyData = prefixedBufferFromValue(0x01, frequency);
const rtlAgcModeData = Buffer.from([0x08,0x00,0x00,0x00,0x00]); // RTL AGC mode auto
const gainModeData = Buffer.from([0x08,0x00,0x00,0x00,0x00]); // Gain mode auto
const agcModeData = Buffer.from([0x0D,0x00,0x00,0x00,0x00]); // AGC mode auto
const gainValueData = prefixedBufferFromValue(0x04, gain);

const startupData = [sampleRateData, frequencyData, rtlAgcModeData, gainModeData, agcModeData, gainValueData];

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