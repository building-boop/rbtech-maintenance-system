/**
 * gas-bridge.js
 * ----------------------------------------------------------------
 * สะพานเชื่อมระหว่างหน้าเว็บ (โฮสต์บน GitHub Pages) กับ Google Apps Script
 * Web App ที่ทำหน้าที่เป็น API เชื่อม Google Sheet
 *
 * มันจำลอง interface ของ google.script.run ของเดิมทุกอย่าง
 * (.withSuccessHandler().withFailureHandler().ชื่อฟังก์ชัน(args))
 * ดังนั้นโค้ดฟอร์ม/แดชบอร์ดเดิมในแต่ละหน้า "ไม่ต้องแก้อะไรเลย"
 *
 * วิธีใช้: ใส่ก่อนแท็ก <script src="gas-bridge.js"></script> ด้วยการตั้งค่า
 *   <script>window.GAS_API_URL = "https://script.google.com/macros/s/XXXXXXXX/exec";</script>
 * ----------------------------------------------------------------
 */
(function () {
  var GAS_API_URL = window.GAS_API_URL || "";

  if (!GAS_API_URL) {
    console.warn("[gas-bridge] ยังไม่ได้ตั้งค่า GAS_API_URL — โค้ดเดิมจะ fallback ไปใช้ข้อมูลตัวอย่างแทน");
    return; // ไม่สร้าง window.google -> เงื่อนไข `if (window.google && google.script...)` จะเป็น false เหมือนเดิม
  }

  function callApi(fnName, args, onSuccess, onFailure) {
    fetch(GAS_API_URL, {
      method: "POST",
      // ใช้ text/plain เพื่อให้เป็น "simple request" เลี่ยง CORS preflight (OPTIONS)
      // เพราะ Apps Script Web App ไม่มี doOptions ให้ตอบ preflight
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ fn: fnName, args: args })
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (json) {
        if (json && json.status === "error") {
          if (onFailure) onFailure(json.message || "เกิดข้อผิดพลาดจากเซิร์ฟเวอร์");
        } else {
          if (onSuccess) onSuccess(json ? json.result : undefined);
        }
      })
      .catch(function (err) {
        console.error("[gas-bridge] เรียก API ล้มเหลว:", fnName, err);
        if (onFailure) onFailure((err && err.message) || String(err));
      });
  }

  function createRunner() {
    var successHandler = null;
    var failureHandler = null;

    var base = {
      withSuccessHandler: function (fn) { successHandler = fn; return proxy; },
      withFailureHandler: function (fn) { failureHandler = fn; return proxy; },
      withUserObject: function () { return proxy; } // เผื่อมีการเรียกใช้ แต่ไม่รองรับจริง
    };

    var proxy = new Proxy(base, {
      get: function (target, prop) {
        if (prop in target) return target[prop];
        // เรียกเสมือนฟังก์ชันฝั่ง Apps Script เช่น .submitReport(a, b, c)
        return function () {
          var args = Array.prototype.slice.call(arguments);
          callApi(prop, args, successHandler, failureHandler);
          successHandler = null;
          failureHandler = null;
        };
      }
    });

    return proxy;
  }

  window.google = window.google || {};
  window.google.script = window.google.script || {};
  // ทุกครั้งที่โค้ดเรียก google.script.run จะได้ runner ใหม่ (พฤติกรรมเหมือนของจริง)
  Object.defineProperty(window.google.script, "run", {
    get: function () { return createRunner(); }
  });
})();