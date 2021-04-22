// CONFIG

// RTL_TCP erver
const rtltcpHost = "127.0.0.1"; // rtl_tcp server host
const rtltcpPort = 3000; // rtl_tcp server port

// Web server
const webServerHost = "127.0.0.1"; // Web server host
const webServerPort = 8080; // Web server port

// Radio
const sampleRate = 250000; // Sampling rate in Hz
const frequency = 104900000; // Frequency in Hz
const gain = 60; // Gain in dB
const iqPeakRemoval = false; // Find average of signal and subtract

// Debug
const startupDataDelay = 50; // Delay between sending startup params
const firstPacketLength = 12; // Expected number of bytes for dongle ID
const averageMax = 1024;

// END CONFIG

const net = require("net");
const http = require("http");
const WebSocket = require("ws");
const fs = require("fs").promises;
const transforms = require("@signalprocessing/transforms");
const client = new net.Socket();

let bandDataArray = [];
let currentResolution = 300;

const requestListener = function (req, res) {
	fs.readFile(__dirname + "/index.html").then((contents) => {
		res.setHeader("Content-Type", "text/html");
		res.writeHead(200);
		res.end(contents);
	});
};

const server = http.createServer(requestListener);
const wss = new WebSocket.Server({
	server: server,
	autoAcceptConnections: false,
});

const makePrefixedBuffer = function (prefix, value, length = 5) {
	if (length <= 0) throw new Error("Cannot use length less than 1!");
	let position = length - 1;
	const dataArray = new Array(length).fill(0);
	dataArray[0] = prefix;
	while (value != 0) {
		dataArray[position] = value & 0xff;
		value >>>= 8;
		position--;
		if (position < 0)
			throw new Error("Data is too large to fit length " + length + "!");
	}
	return Buffer.from(dataArray);
};

const dataSum = new Array(sampleRate).fill(0);
let averageCount = 0;
let processing = false;

const fftTransformBandData = async function () {
	averageCount++;
	const dataI = [];
	const dataQ = [];
	if (averageCount > averageMax) {
		averageCount = Math.floor(averageCount / 2);
		for (let i = 0; i < dataSum.length; i++) {
			dataSum[i] = Math.floor(dataSum[i] / 2);
		}
	}
	for (let i = 0; i < bandDataArray.length; i++) {
		if (i % 2 == 0) {
			dataI.push(bandDataArray[i] - 127.5);
		} else {
			dataQ.push(bandDataArray[i] - 127.5);
		}
	}
	bandDataArray = [];

	let [fftOutReal, fftOutComplex] = transforms.fft(dataI, dataQ);

	const sendDataBuffer = [];

	for (let i = 0; i < fftOutReal.length; i++) {
		if (i % 2 == 0) {
			dataSum[i] += fftOutReal[i];
			dataSum[i + 1] += fftOutComplex[i];

			fftOutReal[i] =
				fftOutReal[i] -
				(iqPeakRemoval ? Math.round(dataSum[i] / averageCount) : 0);
			fftOutComplex[i] =
				fftOutComplex[i] -
				(iqPeakRemoval ? Math.round(dataSum[i + 1] / averageCount) : 0);
		}
		const magnitude = Math.round(
			Math.sqrt(
				fftOutReal[i] * fftOutReal[i] +
					fftOutComplex[i] * fftOutComplex[i]
			)
		);
		if (i % Math.floor(fftOutReal.length / currentResolution) == 0)
			sendDataBuffer.push(magnitude);
	}

	let data = Uint16Array.from(sendDataBuffer);

	processing = false;
	wss.clients.forEach(function each(client) {
		if (client.readyState === WebSocket.OPEN) {
			client.send(data);
		}
	});
};

const sampleRateData = makePrefixedBuffer(0x02, sampleRate);
const frequencyData = makePrefixedBuffer(0x01, frequency);
const rtlAgcModeData = Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00]); // RTL AGC mode auto
const gainModeData = Buffer.from([0x08, 0x00, 0x00, 0x00, 0x00]); // Gain mode auto
const agcModeData = Buffer.from([0x0d, 0x00, 0x00, 0x00, 0x00]); // AGC mode auto
const gainValueData = makePrefixedBuffer(0x04, gain);

const startupData = [
	sampleRateData,
	frequencyData,
	rtlAgcModeData,
	gainModeData,
	agcModeData,
	gainValueData,
];

let firstPacket = true;

const writeStartupData = function (i = 0) {
	client.write(startupData[i]);
	if (i == startupData.length - 1) return;
	setTimeout(function () {
		writeStartupData(i + 1);
	}, startupDataDelay);
};

client.connect(rtltcpPort, rtltcpHost, function () {
	console.log(
		"Connected to rtl_tcp server at " + rtltcpHost + ":" + rtltcpPort
	);
	writeStartupData();
});

client.on("data", function (data) {
	if (processing) return;
	if (firstPacket) {
		if (data.length != firstPacketLength) {
			throw new Error(
				"Unexpected number of bytes for first packet! Expected " +
					firstPacketLength +
					", got " +
					data.length +
					"!"
			);
		}
		console.log(
			"Parameters set successfully. Dongle ID: " + data.toString("hex")
		);
		firstPacket = false;
		return;
	}

	const byteLength = Buffer.byteLength(data);
	let i = 0;
	for (; i < byteLength; i++) {
		if (bandDataArray.length >= sampleRate * 2) break;
		bandDataArray.push(data[i]);
	}
	if (i < byteLength) {
		processing = true;
		fftTransformBandData();
	}
});

client.on("close", function () {
	console.log("Connection closed");
});

wss.on("connection", function connection(ws) {
	console.log("New client connected!");
	ws.on("message", function incoming(data) {
		// New resolution
		currentResolution = parseInt(data);
	});
});

server.listen(webServerPort, webServerHost);
console.log("Web server listening at " + webServerHost + ":" + webServerPort);
