<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <script src='https://obniz.io/js/jquery-3.2.1.min.js'></script>
  <script src='https://unpkg.com/obniz@1.13.1/obniz.js' crossorigin='anonymous'></script>
</head>
<body>

<div id='obniz-debug'></div>
  
  <h1>Fingerprint Door Lock</h1>

  <h2>Setup</h2>
  <ul>
    <li>Test fingerprint: <button id='test'>Test</button></li>
    <li>Enroll fingerprint: <button id='enroll'>Enroll</button></li>
    <li>Delete fingerprint id: <input id='delete_id'></input><button id='delete'>Delete</button></li>
    <li>Delete all fingerprints: <button id='delete_all'>Delete All</button></li>
  </ul>

  <h2>Monitoring</h2>
  <ul>
    <li>Start monitoring: <button id='start_monitor'>Start</button></li>
    <li>Stop monitoring: <button id='stop_monitor' disabled='true'>Stop</button></li>
  </ul>

<script>

/**
 * Config
 */

const OBNIZ_ID = '<YOUR OBNIZ ID></YOUR>';
const UART_TX = 1;
const UART_RX = 0;
const IFTTT_UNLOCK_URL = '<YOUR IFTTT WEBHOOK URL>';

/**
 * Fingerprint monitoring and unlocking
 */

// unlock the door
async function unlockDoor() {
  var http = new XMLHttpRequest();
  http.onload = (e) => {
    console.log('Unlock call succeeded.');
  }
  http.open('GET', IFTTT_UNLOCK_URL);
  http.send();
}

var isMonitoring = false;

// start monitoring fingerprint
async function startMonitor() {
  
  // starting monitoring
  console.log('Monitoring started.');
  while (isMonitoring) {
    
    // wait for finger press
    obniz.display.clear();
    await setLED(true);
    await waitForFingerRelease();
    await waitForFingerPress();
    if (!isMonitoring) continue;
    
    // capture the finger
    await sendCommand(COM_CAPTURE_FINGER);
    await setLED(false);
    obniz.display.clear();
    obniz.display.print('Checking...');
    
    // identify
    await sendCommand(COM_IDENTIFY);
    if (isAck) {
      
      // unlocking the door
      unlockDoor();
      obniz.display.clear();
      obniz.display.print('OK!');
      await obniz.wait(1000);
      obniz.display.clear();
      obniz.display.print('Unlock...');
      console.log('Identified finger id: ' + respParam);
      
    } else {
      
      // error
      obniz.display.clear();
      obniz.display.print('Error :(');
      console.log('Not identified.');
    }
    await obniz.wait(3000);
  }
  
  // stopping monitoring
  console.log('Monitoring stopped.');
  await setLED(false);
  obniz.display.clear();
}

/**
 * Scanner commands
 */

const COM_OPEN = 0x01;
const COM_CLOSE = 0x02;
const COM_LED = 0x12;
const COM_GET_ENROLL_COUNT = 0x20;
const COM_CHECK_ENROLLED = 0x21;
const COM_ENROLL_START = 0x22;
const COM_ENROLL1 = 0x23;
const COM_ENROLL2 = 0x24;
const COM_ENROLL3 = 0x25;
const COM_IS_PRESS_FINGER = 0x26;
const COM_DELETE_ID = 0x40;
const COM_DELETE_ALL = 0x41;
const COM_VERIFY = 0x50;
const COM_IDENTIFY = 0x51;
const COM_CAPTURE_FINGER = 0x60;

// test identifying a finger
async function testFinger(id) {
  
  // turn on LED
  await setLED(true);
  
  // wait for finger pressed and capture it
  console.log('Press finger:');
  await waitForFingerPress();
  await sendCommand(COM_CAPTURE_FINGER);
  
  // identify
  console.log('Checking...');
  if (id) {
    await sendCommand(COM_VERIFY, id);
  } else {
    await sendCommand(COM_IDENTIFY);
  }
  if (isAck) {
    console.log('Identified finger id: ' + respParam);
  } else {
    console.log('Not identified.');
  }
  
  // turn off LED
  await setLED(false);
}
  
// delete specified (or all) fingers
async function deleteFinger(id) {
  if (id) {
    await sendCommand(COM_DELETE_ID, id);
  } else {
    await sendCommand(COM_DELETE_ALL, null);
  }
  if (isAck) {
    console.log('Deleted finger: ' + (id ? id : 'all'));
  }
}

// start enrollment
async function enrollFinger(id) {

  // delete existing finger
  await sendCommand(COM_DELETE_ID, id);
  
  // start enrollment  
  console.log('Enrolling finger id ' + id);
  await sendCommand(COM_ENROLL_START, id);
  if (!isAck) {
    console.log('Enroll failed: ' + respParam.toString(16));
    return;
  }

  // enroll1
  await setLED(true);
  console.log('Press finger (1/3)');
  await waitForFingerPress();
  await sendCommand(COM_CAPTURE_FINGER);
  await sendCommand(COM_ENROLL1, null);
  if (!isAck) {
    console.log('Enroll failed: ' + respParam.toString(16));
    await setLED(false);
    return;
  }
  console.log('Release finger.');
  await waitForFingerRelease();
  
  // enroll2
  console.log('Press finger (2/3)');
  await waitForFingerPress();
  await sendCommand(COM_CAPTURE_FINGER);
  await sendCommand(COM_ENROLL2, null);
  if (!isAck) {
    console.log('Enroll failed: ' + respParam.toString(16));
    await setLED(false);
    return;
  }
  console.log('Release finger.');
  await waitForFingerRelease();
  
  // enroll3
  console.log('Press finger (3/3)');
  await waitForFingerPress();
  await sendCommand(COM_CAPTURE_FINGER);
  await sendCommand(COM_ENROLL3, null);
  if (!isAck) {
    console.log('Enroll failed: ' + respParam.toString(16));
    await setLED(false);
    return;
  }
  
  // turn off LED
  console.log('Enrollment succeeded.');
  await setLED(false);
}

// find next available id
async function getFreeId() {
  for (var i = 0; i < 299; i++) {
    await sendCommand(COM_CHECK_ENROLLED, i);
    if (!isAck) {
      console.log('Found free id: ' + i);
      return i;
    }
  }
  console.log('No available id.');
  return null;
}
  
// wait until finger is pressed
var waitInterrupted = false;
async function waitForFingerPress() {
  waitInterrupted = false;
  while (!waitInterrupted) {
    await sendCommand(COM_IS_PRESS_FINGER, null);
    if (isAck && respParam == 0) return;
//    await obniz.wait(100);
  }
}

// wait until finger is released
async function waitForFingerRelease() {
  waitInterrupted = false;
  while (!waitInterrupted) {
    await sendCommand(COM_IS_PRESS_FINGER, null);
    if (isAck && respParam != 0) return;
//    await obniz.wait(100);
  }
}

// turn on/off LED
async function setLED(isOn) {
  await sendCommand(COM_LED, isOn ? 0x01 : 0x00);
}

// prints enroll count
async function getEnrollCount() {
  await sendCommand(COM_GET_ENROLL_COUNT);
  console.log('Enroll count: ' + respParam);
}
  
// open the scanner device
async function openScanner() {
  await sendCommand(COM_OPEN, 0x00);
  if (isAck) {
    console.log('Scanner opened.');
  }
}

// close the scanner device
async function closeScanner() {
  await sendCommand(COM_CLOSE);
  if (isAck) {
    console.log('Scanner closed.');
  }
}
  
/**
 * UART send and receive
 */

var isAck;
var respParam;
var isWaitingResponse;
  
// sending command and parameter to the scanner. 
// results will be stored on isAck and respParam.
async function sendCommand(command, param) {
  
  // start code and device id
  const mask = 0xff;
  var packet = [0x55, 0xaa, 0x01, 0x00]; 
  
  // send the param
  packet.push(param & mask);
  packet.push((param >> 8) & mask);
  packet.push((param >> 16) & mask);
  packet.push((param >> 24) & mask);

  // send the command
  packet.push(command & mask);
  packet.push((command >> 8) & mask);
  
  // calc check sum
  var sum = getChecksum(packet);
  packet.push(sum & mask);
  packet.push((sum >> 8) & mask);
  
  // send the packet and wait for response
  isWaitingResponse = true;
  isAck = false;
  respParam = null;
  uart.send(packet);
//  console.log('Send: ' + toHexString(packet));
  
  // wait and return the result
  while (isWaitingResponse) {
    await obniz.wait(100); 
  }
}
  
// calc sum from offset 0 to 9
function getChecksum(packet) {
  var sum = 0;
  for (var i = 0; i < 10; i++) {
    sum += packet[i];
  }
  return sum & 0xffff;
}

// receiving response or data packet from the scanner
function onReceivePacket(data, text) {
  
  // receiving a response
  if (data[0] == 0x55 && data[1] == 0xaa) {
    
    // check sum
    var checksum = data[10] + (data[11] << 8);
    if (checksum != getChecksum(data)) {
      console.log('Checksum error: ' + toHexString(data));
      return;
    }

    // decode param and comm
    respParam = data[4] + (data[5] << 8) + (data[6] << 16) + (data[7] << 24);
    isAck = (data[8] + (data[9] << 8)) == 0x30;
    isWaitingResponse = false;
    if (!isAck) {
//      console.log('Nack: error code = ' + respParam.toString(16));
    }
//    console.log('Ack: ' + isAck + ' Resp: ' + toHexString(data));
  
  // receiving a data (do nothing)
  } else if (data[0] == 0x5a && data[1] == 0xa5) {
    console.log('Data: ' + toHexString(data));
  } else {
    console.log('Other: ' + toHexString(data));
  }
}

function toHexString(data) {
  var s = '';
  for (var i = 0; i < data.length; i++) {
    s += ('0' + data[i].toString(16)).slice(-2) + ' ';
  }
  return s;
}

/**
 * main
 */
  
var obniz = new Obniz(OBNIZ_ID);
var uart;
obniz.onconnect = async function () {
  
  // init uart
  uart = obniz.getFreeUart();
  uart.start({tx: UART_TX, rx: UART_RX, baud:9600, drive:'3v'});
  uart.onreceive = onReceivePacket;
    
  // open the scanner
  await openScanner();
  await getEnrollCount();

  // setup display
  obniz.display.font('Avenir', 30); 
  obniz.display.clear();

  // UI handlers
  $('#enroll').on('click', async function(){
    var newId = await getFreeId();
    await enrollFinger(newId);
    await getEnrollCount();
  });
  $('#test').on('click', function(){
    testFinger();
  });
  $('#delete').on('click', function(){
    deleteFinger($('#delete_id').val());
  });
  $('#delete_all').on('click', function(){
    deleteFinger();
  });
  $('#start_monitor').on('click', function(){
    $('#test').prop('disabled', true);
    $('#enroll').prop('disabled', true);
    $('#delete').prop('disabled', true);
    $('#delete_all').prop('disabled', true);
    $('#stop_monitor').prop('disabled', false);
    $('#start_monitor').prop('disabled', true);
    isMonitoring = true;
    startMonitor();
  });
  $('#stop_monitor').on('click', function(){
    $('#test').prop('disabled', false);
    $('#enroll').prop('disabled', false);
    $('#delete').prop('disabled', false);
    $('#delete_all').prop('disabled', false);
    $('#stop_monitor').prop('disabled', true);
    $('#start_monitor').prop('disabled', false);
    isMonitoring = false;
    waitInterrupted = true;
  });
  
}

</script>
</body>
</html>
