// ============================================================
// ค่าคงที่การตั้งค่าระบบ
// ============================================================
// เปลี่ยนเป็น Folder ID ของ Google Drive คุณ (ตั้งค่าไว้ให้แล้ว)
const DRIVE_FOLDER_ID = "1023NaBhmYs4To5psBHw9n2BG8r31mNg4";
// ใช้ Channel Access Token ของ LINE OA ของคุณ (ตั้งค่าไว้ให้แล้ว)
const LINE_CHANNEL_ACCESS_TOKEN = "OzBbvlZpme8g5uOhybGEvpb8WB89X6jB+mirNetVuXhdWjUcxuoj1wiwXmaVDFFGD0342xAQRERms0Nc4Y7KtD5rWwCGm9MgqV+QEkJ4RO7mM4JsMILg9IL7UhDNT7ies8ilHsH63Xs985qFMjDbIgdB04t89/1O/w1cDnyilFU=";

// ⚠️ สำคัญมาก: ใส่ Group ID ของกลุ่มแอดมิน/เจ้าหน้าที่ตรงนี้ (ขึ้นต้นด้วย C)
// ถ้ายังใช้ User ID เดี่ยวอยู่ (ขึ้นต้นด้วย U) จะแจ้งเตือนได้แค่คนเดียว
const LINE_TARGET_ID = "C02357a501a20c888ca0e75b7d76dc1b4";

var THAI_MONTHS_SHORT = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
                          "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ============================================================
// ฟังก์ชันช่วยจัดรูปแบบวันที่/เวลาแบบไทย (ใช้ในข้อความแจ้งเตือน/ยืนยัน)
// เช่น "24 ก.ค. 2569 เวลา 14:35 น."
// ============================================================
function formatThaiDateTime(date) {
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  var day = Utilities.formatDate(date, tz, "d");
  var month = THAI_MONTHS_SHORT[Number(Utilities.formatDate(date, tz, "M")) - 1];
  var year = Number(Utilities.formatDate(date, tz, "yyyy")) + 543; // แปลงเป็น พ.ศ.
  var time = Utilities.formatDate(date, tz, "HH:mm");
  return day + " " + month + " " + year + " เวลา " + time + " น.";
}

// ============================================================
// รายชื่อฟังก์ชันที่อนุญาตให้เรียกผ่าน API จากภายนอก (เช่น หน้าเว็บบน GitHub Pages)
// ⚠️ ห้ามเปิดฟังก์ชันอื่นที่ไม่ได้ตั้งใจให้เรียกจากภายนอก เพราะ Web App นี้เปิดสาธารณะ
// ============================================================
var ALLOWED_API_FUNCTIONS = {
  submitReport: submitReport,
  getDashboardData: getDashboardData,
  getDashboardStats: getDashboardStats
};

// ============================================================
// ทางเข้าเว็บแอป (GET) — เปิดหน้าเว็บตาม ?page=xxx
// ============================================================
function doGet(e) {
  e = e || {};
  e.parameter = e.parameter || {};

  var page = e.parameter.page || "admin";

  if (page.indexOf("?") === 0) {
    page = page.substring(1);
  }

  try {
    return HtmlService.createTemplateFromFile(page)
      .evaluate()
      .addMetaTag("viewport", "width=device-width, initial-scale=1")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput(
      "<h3>❌ ไม่พบไฟล์ HTML ชื่อ: " + page + "</h3><br><pre>" + err + "</pre>"
    );
  }
}

// ============================================================
// ทางเข้า Webhook ของ LINE (POST) — ใช้จับ userId/groupId/ชื่อจริง
// เพื่อเอาไปกรอกในชีต Staff_LineID (จับคู่ชื่อ -> userId)
// และหา Group ID ของกลุ่มแอดมิน (ดูในชีต DebugLog)
// ============================================================
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (parseErr) {
    return ContentService.createTextOutput("OK"); // body แปลกๆ ก็เงียบไว้เหมือนเดิม
  }

  // ---- กรณีที่ 1: เป็นการเรียก API จากหน้าเว็บ (มี field "fn") ----
  // ใช้แยกจาก LINE webhook (LINE จะส่ง field "events" มาแทน)
  if (body && body.fn) {
    return handleApiRequest(body);
  }

  // ---- กรณีที่ 2: เป็น LINE Webhook (โค้ดเดิมทั้งหมด ไม่แก้ไข) ----
  return handleLineWebhook(body);
}

// ============================================================
// จัดการ request ที่เรียกมาจากหน้าเว็บ (fetch จาก GitHub Pages)
// รูปแบบ payload: { fn: "submitReport", args: [type, formData, base64, fileName] }
// ============================================================
function handleApiRequest(body) {
  var output;
  var fn = ALLOWED_API_FUNCTIONS[body.fn];

  if (!fn) {
    output = { status: "error", message: "ไม่พบฟังก์ชัน หรือไม่อนุญาตให้เรียก: " + body.fn };
  } else {
    try {
      var result = fn.apply(null, body.args || []);
      output = { status: "ok", result: result };
    } catch (err) {
      output = { status: "error", message: err.toString() };
    }
  }

  return ContentService.createTextOutput(JSON.stringify(output))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// จัดการ LINE Webhook — ย้ายโค้ดเดิมของ doPost มาไว้ที่นี่เฉยๆ ไม่ได้แก้ logic
// ============================================================
function handleLineWebhook(data) {
  try {
    var event = data.events[0];
    var sourceType = event.source.type; // "user" หรือ "group" หรือ "room"
    var groupId = event.source.groupId || "";
    var userId = event.source.userId || "";

    var displayName = "";
    if (userId) {
      try {
        // ถ้าเป็นข้อความจากกลุ่ม ต้องใช้ Group Member Profile API แทน
        // เพราะ /v2/bot/profile/{userId} ใช้ได้เฉพาะคนที่แอด OA เป็นเพื่อน 1:1 เท่านั้น
        var profileUrl = groupId
          ? "https://api.line.me/v2/bot/group/" + groupId + "/member/" + userId
          : "https://api.line.me/v2/bot/profile/" + userId;

        var res = UrlFetchApp.fetch(profileUrl, {
          headers: { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
          muteHttpExceptions: true
        });

        if (res.getResponseCode() === 200) {
          var profile = JSON.parse(res.getContentText());
          displayName = profile.displayName || "";
        } else {
          // เก็บ status code ไว้ด้วย จะได้รู้สาเหตุตอนดีบัก เช่น 403 = ไม่มีสิทธิ์เข้าถึง
          displayName = "(ดึงชื่อไม่สำเร็จ: " + res.getResponseCode() + ")";
        }
      } catch (profErr) {
        displayName = "(ดึงชื่อไม่สำเร็จ: " + profErr + ")";
      }
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DebugLog");
    if (sheet) {
      sheet.appendRow([
        new Date(),
        "type: " + sourceType,
        "groupId: " + groupId,
        "userId: " + userId,
        "displayName: " + displayName
      ]);
    }
  } catch (err) {
    // เงียบไว้ ไม่ต้องทำอะไร กัน error ทำให้ webhook ตอบไม่ทัน
  }
  return ContentService.createTextOutput("OK");
}

// ============================================================
// ฟังก์ชันรวมสำหรับบันทึกข้อมูลทุกประเภท (เรียกจากฟอร์มฝั่งหน้าเว็บ)
// ============================================================
function submitReport(type, formData, base64Data, fileName) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(type);
    var timestamp = new Date();
    var photoUrl = "";

    // 1. จัดการอัปโหลดรูปภาพถ้ามี
    if (base64Data && fileName && base64Data.indexOf(',') !== -1) {
      try {
        var folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
        var contentType = base64Data.substring(5, base64Data.indexOf(';'));
        var bytes = Utilities.base64Decode(base64Data.split(',')[1]);
        var blob = Utilities.newBlob(bytes, contentType, fileName);
        var file = folder.createFile(blob);
        photoUrl = file.getUrl();
      } catch (fileErr) {
        console.log("Image upload error: " + fileErr.toString());
      }
    }

    // 2. แยกบันทึกข้อมูลตามประเภทตาราง + เตรียมชื่อผู้ส่ง + ข้อความยืนยันส่วนตัว
    var lineMessage = "";
    var senderName = "";
    var confirmMessage = "";
    var dateText = formatThaiDateTime(timestamp); // ใช้แปะท้ายข้อความยืนยันส่วนตัว

    if (type === "Daily_Logs") {
      sheet.appendRow([timestamp, formData.staff_name, formData.location, formData.task_cleaning, formData.task_trash, photoUrl]);
      lineMessage = `🧹 รายงานประจำวัน (แม่บ้าน)\nโดย: ${formData.staff_name}\nสถานที่: ${formData.location}\nความสะอาด: ${formData.task_cleaning}\nถังขยะ: ${formData.task_trash}`;
      senderName = formData.staff_name;
      confirmMessage = `✅ ส่งรายงานทำความสะอาดประจำวันเรียบร้อยแล้ว\nสถานที่: ${formData.location}\n🕒 ${dateText}`;
    }
    else if (type === "Weekly_Inspections") {
      var rowData = [timestamp, formData.inspector, formData.location];
      for (var i = 1; i <= 15; i++) {
        rowData.push(formData["item_" + i]);
      }
      rowData.push(photoUrl);
      sheet.appendRow(rowData);
      lineMessage = `📋 ตรวจเช็คประจำสัปดาห์\nโดย: ${formData.inspector}\nสถานที่: ${formData.location}\nสถานะ: ตรวจสอบแล้ว 15 รายการ`;
      senderName = formData.inspector;
      confirmMessage = `✅ ส่งรายงานตรวจสุขาภิบาลประจำสัปดาห์เรียบร้อยแล้ว\nสถานที่: ${formData.location}\n🕒 ${dateText}`;
    }
    else if (type === "Student_Reports") {
      sheet.appendRow([timestamp, formData.location, formData.issue_type, formData.details, photoUrl, "รอดำเนินการ"]);
      lineMessage = `🚨 นักเรียนแจ้งปัญหา!\nสถานที่: ${formData.location}\nประเภท: ${formData.issue_type}\nรายละเอียด: ${formData.details}`;
      // แจ้งซ่อมมักไม่มีชื่อผู้แจ้งแบบเจาะจง (นักเรียนแจ้งผ่าน QR) จึงไม่ส่งยืนยันส่วนตัว
      senderName = "";
      confirmMessage = "";
    }
    else if (type === "Purchase_Requests") {
      sheet.appendRow([timestamp, formData.requester, formData.item_name, formData.quantity, formData.price_per_unit, formData.total_price, photoUrl, formData.note]);
      lineMessage = `🛒 แจ้งขอซื้ออุปกรณ์พัสดุ\nโดย: ${formData.requester}\nรายการ: ${formData.item_name}\nจำนวน: ${formData.quantity} หน่วย\nรวมเป็นเงิน: ${formData.total_price} บาท`;
      senderName = formData.requester;
      confirmMessage = `✅ ส่งคำขอซื้ออุปกรณ์เรียบร้อยแล้ว\nรายการ: ${formData.item_name}\n🕒 ${dateText}`;
    }

    // 3. ส่งแจ้งเตือน LINE ทั้งหมด (กลุ่ม + ส่วนตัว) พร้อมกันในครั้งเดียวด้วย fetchAll
    //    (แทนที่จะยิงทีละรอบตามลำดับแบบเดิม ซึ่งรอ 2 รอบต่อกัน)
    //    หมายเหตุ: วิธีนี้ยังคงรันก่อน return (ไม่ใช่เบื้องหลังแบบ trigger เพราะติดปัญหาสิทธิ์
    //    script.scriptapp บนเว็บแอปที่ deploy แบบ execute as ผู้เข้าใช้งาน) แต่เร็วขึ้นจากเดิม
    //    เพราะยิง 2 คำขอพร้อมกันแทนที่จะรอทีละคำขอ
    if (LINE_CHANNEL_ACCESS_TOKEN && LINE_TARGET_ID && LINE_TARGET_ID !== "ใส่_USER_ID_หรือ_GROUP_ID_ตรงนี้") {
      sendLineNotifications(lineMessage, photoUrl, senderName, confirmMessage);
    }

    return { status: "success", message: "บันทึกข้อมูลเรียบร้อยแล้ว" };
  } catch (err) {
    return { status: "error", message: err.toString() };
  }
}

// ============================================================
// ยิงข้อความ LINE ทั้งกลุ่มแอดมินและยืนยันส่วนตัว "พร้อมกัน" ด้วย UrlFetchApp.fetchAll
// แทนที่จะยิงทีละรอบ (sendLineOA แล้วค่อย sendLineConfirmation) แบบเดิม
// ประหยัดเวลาไปได้ประมาณครึ่งหนึ่งของเวลารวมที่ใช้ยิง LINE ทั้ง 2 รอบ
// ============================================================
function sendLineNotifications(lineMessage, photoUrl, senderName, confirmMessage) {
  var url = "https://api.line.me/v2/bot/message/push";
  var authHeader = { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN };

  // 1. เตรียมข้อความสำหรับกลุ่มแอดมิน (รูปแบบเดิมทุกอย่าง)
  var combinedText = lineMessage;
  if (photoUrl) {
    combinedText += `\n\n🔗 เปิดดูรูปหลักฐาน:\n${photoUrl}`;
  }
  combinedText += "\n\n📋 หน้าระบบงานอาคารและสถานที่\nสำหรับตรวจสอบรายงานทั้งหมด\n👉 https://building-boop.github.io/rbtech-maintenance-system/admin.html";

  var requests = [];
  requests.push({
    url: url,
    method: "post",
    contentType: "application/json",
    headers: authHeader,
    payload: JSON.stringify({ "to": LINE_TARGET_ID, "messages": [{ "type": "text", "text": combinedText }] }),
    muteHttpExceptions: true
  });

  // 2. ถ้ามีคนส่งที่ระบุตัวตนได้ + หา userId เจอ ให้เตรียมคำขอที่ 2 (ยืนยันส่วนตัว)
  var senderUserId = null;
  if (senderName && confirmMessage) {
    senderUserId = getLineUserIdByName(senderName);
    if (senderUserId) {
      requests.push({
        url: url,
        method: "post",
        contentType: "application/json",
        headers: authHeader,
        payload: JSON.stringify({ "to": senderUserId, "messages": [{ "type": "text", "text": confirmMessage }] }),
        muteHttpExceptions: true
      });
    } else {
      var dbgSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DebugLog");
      if (dbgSheet) {
        dbgSheet.appendRow([
          new Date(),
          "ไม่พบ LINE userId สำหรับชื่อ: " + senderName,
          "ตรวจสอบการสะกด/วรรคในชีต Staff_LineID ให้ตรงกับฟอร์ม"
        ]);
      }
    }
  }

  // 3. ยิงทุกคำขอพร้อมกันในครั้งเดียว (ประหยัดเวลากว่ายิงทีละรอบ)
  var responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (fetchErr) {
    var dbgSheet2 = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DebugLog");
    if (dbgSheet2) {
      dbgSheet2.appendRow([new Date(), "sendLineNotifications fetchAll error", fetchErr.toString()]);
    }
    return;
  }

  // 4. log ไว้เฉพาะตอนที่ล้มเหลว (ไม่ log ทุกครั้งที่สำเร็จ เพื่อลดจำนวนครั้งที่ต้องเขียนชีต)
  var dbgSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DebugLog");
  if (responses[0].getResponseCode() !== 200 && dbgSheet) {
    dbgSheet.appendRow([
      new Date(),
      "sendLineOA (กลุ่ม) ล้มเหลว: " + LINE_TARGET_ID,
      "HTTP status: " + responses[0].getResponseCode(),
      "response: " + responses[0].getContentText()
    ]);
  }
  if (senderUserId && responses[1] && responses[1].getResponseCode() !== 200 && dbgSheet) {
    dbgSheet.appendRow([
      new Date(),
      "sendLineConfirmation (ส่วนตัว) ล้มเหลว: " + senderUserId,
      "HTTP status: " + responses[1].getResponseCode(),
      "response: " + responses[1].getContentText()
    ]);
  }
}

// ============================================================
// ดึงเฉพาะแถวของชีตที่ตรงกับ "วันที่" ที่ร้องขอ (dateStr แบบ "YYYY-MM-DD")
// ใช้ค่า Date จริงจาก getValues() ในการเทียบวันที่ (แม่นยำกว่าการเทียบข้อความ)
// คืนค่าข้อมูลเป็น getDisplayValues() เพื่อให้หน้าเว็บได้ข้อความที่จัดรูปแบบแล้ว
// ============================================================
function filterSheetByDate(sheetName, dateStr, tz) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2) return [];

  var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var rawValues = range.getValues();
  var displayValues = range.getDisplayValues();

  var result = [];
  for (var i = 0; i < rawValues.length; i++) {
    var ts = rawValues[i][0];
    if (ts instanceof Date && !isNaN(ts.getTime())) {
      var rowDateStr = Utilities.formatDate(ts, tz, "yyyy-MM-dd");
      if (rowDateStr === dateStr) {
        result.push(displayValues[i]);
      }
    }
  }

  result.reverse(); // ให้รายการล่าสุดของวันนั้นขึ้นก่อน
  return result;
}

// ============================================================
// ฟังก์ชันดึงข้อมูลสำหรับหน้า admin (ดูรายวัน + dropdown สถานที่/บุคลากร)
// dateStr (ไม่บังคับ): "YYYY-MM-DD" ถ้าไม่ส่งมาจะถือว่าเป็น "วันนี้"
// ============================================================
function getDashboardData(dateStr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();

  if (!dateStr) {
    dateStr = Utilities.formatDate(new Date(), tz, "yyyy-MM-dd");
  }

  var settingsSheet = ss.getSheetByName("Settings");
  var locations = settingsSheet.getRange(2, 1, settingsSheet.getLastRow() - 1, 1).getValues().flat();
  var staffs = settingsSheet.getRange(2, 2, settingsSheet.getLastRow() - 1, 1).getValues().flat();
  var janitors = settingsSheet.getRange(2, 3, settingsSheet.getLastRow() - 1, 1).getValues().flat().filter(String);

  return {
    locations: locations,
    staffs: staffs,
    janitors: janitors,
    selectedDate: dateStr,
    daily: filterSheetByDate("Daily_Logs", dateStr, tz),
    weekly: filterSheetByDate("Weekly_Inspections", dateStr, tz),
    student: filterSheetByDate("Student_Reports", dateStr, tz),
    purchase: filterSheetByDate("Purchase_Requests", dateStr, tz)
  };
}

// ============================================================
// ดึงข้อมูลสรุปสำหรับหน้า Dashboard (สรุปยอดตามช่วงเวลา เดือน/ปี)
// แยกจาก getDashboardData(dateStr) ซึ่งใช้กับหน้า admin (ดึงข้อมูลรายวัน)
//
// @param {string} period "month" (ค่าเริ่มต้น) หรือ "year"
// @return {
//   cleaning: number,
//   sanitary: number,
//   repairPending: number,
//   budget: number,
//   repairHistory:    { labels: string[], counts: number[] },  // 6 เดือนย้อนหลัง
//   repairByLocation: { labels: string[], counts: number[] }   // สถานที่แจ้งซ่อมบ่อยที่สุด 5 อันดับ + อื่นๆ (ทุกช่วงเวลา)
// }
// ============================================================
function getDashboardStats(period) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date();
  period = period || "month";

  var rangeStart, rangeEnd;
  if (period === "year") {
    rangeStart = new Date(now.getFullYear(), 0, 1);
    rangeEnd = new Date(now.getFullYear() + 1, 0, 1);
  } else {
    rangeStart = new Date(now.getFullYear(), now.getMonth(), 1);
    rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  function getRows(sheetName) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return [];
    return sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  }

  function inRange(ts) {
    return ts instanceof Date && !isNaN(ts.getTime()) && ts >= rangeStart && ts < rangeEnd;
  }

  // --- 1. ทำความสะอาด: จำนวนแถวใน Daily_Logs ช่วงที่เลือก ---
  var dailyRows = getRows("Daily_Logs");
  var cleaningCount = dailyRows.filter(function (r) { return inRange(r[0]); }).length;

  // --- 2. ตรวจสุขาภิบาล: จำนวนแถวใน Weekly_Inspections ช่วงที่เลือก ---
  var weeklyRows = getRows("Weekly_Inspections");
  var sanitaryCount = weeklyRows.filter(function (r) { return inRange(r[0]); }).length;

  // --- 3. แจ้งซ่อม (Student_Reports) ---
  // คอลัมน์: timestamp(0), location(1), issue_type(2), details(3), photoUrl(4), status(5)
  // หมายเหตุ: คอลัมน์ status ถูก hardcode เป็น "รอดำเนินการ" ทุกแถวตอนบันทึก (ดู submitReport)
  // และไม่มีจุดไหนในระบบอัปเดตสถานะภายหลัง จึงยังใช้นับ "รอดำเนินการ" สำหรับการ์ดได้
  // (เท่ากับนับจำนวนแจ้งซ่อมทั้งหมดในช่วงเวลานั้น)
  var STATUS_COL = 5;
  var LOCATION_COL = 1;
  var studentRows = getRows("Student_Reports");
  var repairPendingCount = studentRows.filter(function (r) {
    return inRange(r[0]) && r[STATUS_COL] === "รอดำเนินการ";
  }).length;

  // สัดส่วนตามสถานที่ที่แจ้งซ่อมบ่อยที่สุด นับรวมทุกช่วงเวลา เพื่อให้เห็นภาพรวมทั้งระบบ
  // จำกัดไว้ 5 อันดับแรก ที่เหลือรวมเป็น "อื่นๆ" กันกราฟวงกลมรกเกินไป
  var locationCounts = {};
  studentRows.forEach(function (r) {
    var loc = r[LOCATION_COL] || "ไม่ระบุ";
    locationCounts[loc] = (locationCounts[loc] || 0) + 1;
  });
  var sortedLocations = Object.keys(locationCounts)
    .map(function (loc) { return { label: loc, count: locationCounts[loc] }; })
    .sort(function (a, b) { return b.count - a.count; });

  var topLocations = sortedLocations.slice(0, 5);
  var otherCount = sortedLocations.slice(5).reduce(function (sum, item) { return sum + item.count; }, 0);
  if (otherCount > 0) {
    topLocations.push({ label: "อื่นๆ", count: otherCount });
  }

  // --- 4. งบขอซื้ออุปกรณ์ (Purchase_Requests) ---
  // คอลัมน์: timestamp(0), requester(1), item_name(2), quantity(3), price_per_unit(4), total_price(5), photoUrl(6), note(7)
  var TOTAL_PRICE_COL = 5;
  var purchaseRows = getRows("Purchase_Requests");
  var budgetSum = purchaseRows
    .filter(function (r) { return inRange(r[0]); })
    .reduce(function (sum, r) { return sum + (Number(r[TOTAL_PRICE_COL]) || 0); }, 0);

  // --- 5. กราฟแท่ง: จำนวนแจ้งซ่อมย้อนหลัง 6 เดือน (นับจากเดือนปัจจุบันย้อนไป) ---
  var monthLabels = [];
  var monthCounts = [];
  for (var i = 5; i >= 0; i--) {
    var monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    monthLabels.push(THAI_MONTHS_SHORT[monthStart.getMonth()]);
    var count = studentRows.filter(function (r) {
      return r[0] instanceof Date && r[0] >= monthStart && r[0] < monthEnd;
    }).length;
    monthCounts.push(count);
  }

  return {
    cleaning: cleaningCount,
    sanitary: sanitaryCount,
    repairPending: repairPendingCount,
    budget: budgetSum,
    repairHistory: { labels: monthLabels, counts: monthCounts },
    repairByLocation: {
      labels: topLocations.map(function (item) { return item.label; }),
      counts: topLocations.map(function (item) { return item.count; })
    }
  };
}

// ============================================================
// ค้นหา LINE userId จากชื่อ ในชีต Staff_LineID (คอลัมน์ A: Name, B: LineUserId)
// ============================================================
function getLineUserIdByName(name) {
  if (!name) return null;
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Staff_LineID");
  if (!sheet) return null;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // [ [name, userId], ... ]
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(name).trim()) {
      return data[i][1] || null;
    }
  }
  return null;
}

// ============================================================
// ส่งข้อความยืนยันส่วนตัว กลับไปหาคนที่กดส่งฟอร์ม
// (แยกจาก sendLineOA ซึ่งใช้ยิงเข้ากลุ่มแอดมิน)
// หมายเหตุ: ฟังก์ชันนี้ไม่ได้ถูกเรียกจาก submitReport โดยตรงแล้ว
// (ตอนนี้ submitReport เรียก sendLineNotifications ซึ่งยิงพร้อมกับ sendLineOA ผ่าน fetchAll แทน)
// เก็บฟังก์ชันนี้ไว้เผื่อต้องการเรียกใช้แยกทดสอบ/ดีบัก
// ============================================================
function sendLineConfirmation(userId, confirmText) {
  if (!userId) return; // ไม่รู้ userId ก็ข้ามไป ไม่ error

  var url = "https://api.line.me/v2/bot/message/push";
  var payload = {
    "to": userId,
    "messages": [{ "type": "text", "text": confirmText }]
  };
  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };
  UrlFetchApp.fetch(url, options);
}

// ============================================================
// ฟังก์ชันส่งข้อความผ่าน LINE OA (Messaging API) — ใช้ยิงเข้ากลุ่มแอดมิน/เจ้าหน้าที่
// หมายเหตุ: ฟังก์ชันนี้ไม่ได้ถูกเรียกจาก submitReport โดยตรงแล้ว เก็บไว้เผื่อเรียกใช้แยกทดสอบ/ดีบัก
// ============================================================
function sendLineOA(messageText, photoUrl) {
  var url = "https://api.line.me/v2/bot/message/push";

  // 1. นำข้อความหลักมาตั้งต้น
  var combinedText = messageText;

  // 2. ถ้ามีรูปถ่าย ให้เคาะบรรทัด (\n\n) แล้วต่อด้วยลิงก์รูป
  if (photoUrl) {
    combinedText += `\n\n🔗 เปิดดูรูปหลักฐาน:\n${photoUrl}`;
  }

  // 3. เคาะบรรทัดแล้วต่อด้วยลิงก์เข้าหน้า Dashboard ให้ Admin ตอนท้ายสุด
  combinedText += "\n\n📋 หน้าระบบงานอาคารและสถานที่\nสำหรับตรวจสอบรายงานทั้งหมด\n👉 https://building-boop.github.io/rbtech-maintenance-system/admin.html";

  // รวมเป็น Message เดียว (1 บับเบิ้ล)
  var messages = [{ "type": "text", "text": combinedText }];

  var payload = { "to": LINE_TARGET_ID, "messages": messages };
  var options = {
    "method": "post",
    "contentType": "application/json",
    "headers": { "Authorization": "Bearer " + LINE_CHANNEL_ACCESS_TOKEN },
    "payload": JSON.stringify(payload),
    "muteHttpExceptions": true
  };

  var res = UrlFetchApp.fetch(url, options);

  // 🔍 log ผลลัพธ์จริงจาก LINE API ไว้ดูใน DebugLog เผื่อ push ล้มเหลว
  // (ถ้าสำเร็จจะได้ code 200 กับ body ว่างๆ, ถ้าล้มเหลวจะบอกสาเหตุ เช่น
  // "The user hasn't added the bot as a friend" หรือ groupId ไม่ถูกต้อง)
  var dbgSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("DebugLog");
  if (dbgSheet) {
    dbgSheet.appendRow([
      new Date(),
      "sendLineOA ส่งไปที่: " + LINE_TARGET_ID,
      "HTTP status: " + res.getResponseCode(),
      "response: " + res.getContentText()
    ]);
  }
}
