//
// vim: set expandtab ts=4 sw=4:
//

// console.debug("init popup");

// These must match same constants in background.js
const alarmPrefix = "autoresume-";
const alarmMonitor = alarmPrefix + "monitor";
const alarmPopup = alarmPrefix + "popup";

// console.debug("autoresume: init popup script");

function downloadCB(ev) {
    let el = ev.target;
    let msg = {
        command: "update",
        selected: el.checked,
        id: el.value,
    };
    return browser.runtime.sendMessage(msg);
    // console.info("autoresume: sent update");
    // console.debug(msg);
}

function displaySize(value, divisor) {
    let v = value / divisor;
    // parseFloat will remove trailing 0s
    return Number.parseFloat(v.toPrecision(3));
}

function displayUnit(value) {
    let divisor, unit;
    if (value >= 1000000000) {
        divisor = 1000000000;
        unit = "GB";
    } else if (value >= 1000000) {
        divisor = 1000000;
        unit = "MB";
    } else if (value >= 1000) {
        divisor = 1000;
        unit = "KB";
    } else {
        divisor = 1;
        unit = "B";
    }
    return {
        divisor: divisor,
        unit: unit
    };
}

function showDownloads(downloads, auto, options) {
    let activeDownloads = document.body.querySelector(".active-downloads");
    activeDownloads.replaceChildren();
    let count = 0;
    for (let dl of downloads) {
        let dlId = dl.id.toString();
        // If download is not in progress and cannot be resumed,
        // we do not bother to display it.
        if (dl.state != "in_progress" && !dl.canResume)
            continue;
        let row = document.createElement("div");
        row.className = "download-row";
        activeDownloads.appendChild(row);
        let status = document.createElement("div");
        status.className = "download-status";
        let checkbox = document.createElement("input");
        checkbox.setAttribute("type", "checkbox");
        checkbox.value = dlId;
        checkbox.className = "autoresume";
        checkbox.checked = auto[dlId];
        checkbox.addEventListener("change", downloadCB);
        status.appendChild(checkbox);
        let img = document.createElement("img");
        img.className = "download-state";
        if (dl.state == "in_progress")
            img.src = "../icons/status-running.png";
        else
            img.src = "../icons/status-stopped.png";
        status.appendChild(img);
        row.appendChild(status);
        let filename = dl.filename.replace(/^.*[\\\/]/, '');
        if (options.monitorInterval) {
            let label = document.createElement("div");
            label.className = "download-label";
            let fn = document.createElement("div");
            fn.textContent = filename;
            fn.className = "download-filename";
            label.appendChild(fn);
            // Estimate the download rate and time remaining
            // using the overall rate so far
            let now = new Date();
            let start = new Date(dl.startTime);
            let dlTime = (now - start) / 1000;
            let dlRate = dl.bytesReceived / dlTime;    // B/sec
            let rate = "";
            if (dlRate > 1000000)
                rate += (dlRate / 1000000).toFixed(1) + " MB/s";
            else if (dlRate > 1000)
                rate += (dlRate / 1000).toFixed(0) + " kB/s";
            else
                rate += dlRate.toFixed(0) + " B/s";
            let msg = "";
            if (dl.totalBytes && dl.totalBytes > 0) {
                let bytesLeft = dl.totalBytes - dl.bytesReceived;
                let secondsLeft = Math.trunc(bytesLeft / dlRate);
                let minutesLeft = Math.trunc(secondsLeft / 60);
                let hoursLeft = Math.trunc(minutesLeft / 60);
                let rem = "";
                if (hoursLeft) {
                    rem += hoursLeft + "h ";
                    minutesLeft -= hoursLeft * 60;
                }
                if (minutesLeft)
                    rem += minutesLeft + "m ";
                if (!rem)
                    rem = secondsLeft + "s ";
                rem += "left";
                let pct = Math.round(dl.bytesReceived / dl.totalBytes * 100);
                let u = displayUnit(dl.totalBytes);
                let recv = displaySize(dl.bytesReceived, u.divisor);
                let total = displaySize(dl.totalBytes, u.divisor);
                msg = rem + " \u2013 " +
                      recv + " of " + total + " " + u.unit + ", " +
                      pct + "% @ " + rate;
            } else
                msg = rate;
            let rem = document.createElement("div");
            rem.textContent = msg;
            rem.className = "download-rate";
            label.appendChild(rem);
            row.appendChild(label);
        } else {
            let label = document.createElement("label");
            label.textContent = filename;
            row.appendChild(label);
        }
        count += 1;
    }
    if (count == 0) {
        let row = document.createElement("div");
        row.textContent = "No active downloads.";
        row.className = "download-row";
        activeDownloads.appendChild(row);
    }
}

// console.debug("loading");

document.getElementById("options").addEventListener("click", (ev) => {
    browser.runtime.openOptionsPage();
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // console.info("autoresume: popup received command: " +
    //              msg.command);
    // console.debug(msg);
    if (msg.command == "show-downloads") {
        showDownloads(msg.downloads, msg.auto, msg.options);
        if (msg.options.monitorInterval && Object.keys(msg.auto) > 0) {
            let pim = msg.options.monitorInterval / 60.0;
            browser.alarms.get(alarmMonitor).then(async (alarm) => {
                if (!alarm) {
                    if (msg.options.debug)
                        console.debug("create alarm: " + alarmMonitor +
                                      " period: " + pim + " minutes");
                    browser.alarms.create(alarmMonitor,
                                                {periodInMinutes:pim});
                }
            });
        } else {
            if (msg.options.debug)
                console.debug("clear alarm: " + alarmMonitor);
            browser.alarms.clear(alarmMonitor);
        }
    }
    sendResponse(true);
    return true;
});

// Create a port so that background script can detect
// when we go away
const port = browser.runtime.connect({ name: alarmPopup });

// console.debug("finished init popup");
