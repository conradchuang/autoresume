//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    const alarmPrefix = "autoresume-";

    // console.info("autoresume: init popup script");

    function downloadCB(ev) {
        let el = ev.target;
        let msg = {
            command: "update",
            selected: el.checked,
            id: el.value,
        };
        browser.runtime.sendMessage(msg);
        // console.info("autoresume: sent update");
        // console.debug(msg);
    }

    function showDownloads(downloads, auto, options) {
        let activeDownloads = document.body.querySelector(".active-downloads");
        activeDownloads.replaceChildren();
        let count = 0;
        for (let dl of downloads) {
            let dlId = dl.id.toString();
            // If download is finished, we should not display it.
            if (dl.state == "complete")
                continue;
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
            activeDownloads.appendChild(status);
            let filename = dl.filename.replace(/^.*[\\\/]/, '');
            if (options.monitorInterval) {
                // Estimate the download rate and time remaining
                // using the overall rate so far
                let now = new Date();
                let start = new Date(dl.startTime);
                let dlTime = (now - start) / 1000;
                let dlRate = dl.bytesReceived / dlTime;    // B/sec
                let msg = "(";
                if (dlRate > 1000000)
                    msg += (dlRate / 1000000).toFixed(1) + " MB/s";
                else if (dlRate > 1000)
                    msg += (dlRate / 1000).toFixed(0) + " kB/s";
                else
                    msg += dlRate.toFixed(0) + " B/s";
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
                    msg += ", " + rem + "left";
                }
                msg += ") ";
                let label = document.createElement("div");
                label.className = "download-label";
                label.textContent = filename + " " + msg;
                activeDownloads.appendChild(label);
            } else {
                let label = document.createElement("label");
                label.textContent = filename;
                activeDownloads.appendChild(label);
            }
            activeDownloads.appendChild(document.createElement("br"));
            count += 1;
        }
        if (count == 0) {
            let p = document.createElement("p");
            p.textContent = "No active downloads.";
            activeDownloads.appendChild(p);
        }
    }

    window.addEventListener("load", (event) => {
        document.getElementById("options").addEventListener("click", (ev) => {
            browser.runtime.openOptionsPage();
        });

        browser.runtime.onMessage.addListener(async (msg, sender, respond) => {
            // console.info("autoresume: popup received command: " +
            //              msg.command);
            // console.debug(msg);
            if (msg.command == "show-downloads") {
                showDownloads(msg.downloads, msg.auto, msg.options);
                let name = alarmPrefix + "monitor";
                if (msg.options.monitorInterval && Object.keys(msg.auto) > 0) {
                    let pim = msg.options.monitorInterval / 60.0;
                    await browser.alarms.get(name).then(async (alarm) => {
                        if (!alarm) {
                            if (msg.options.debug)
                                console.debug("create alarm: " + name +
                                              " period: " + pim + " minutes");
                            return browser.alarms.create(name,
                                                        {periodInMinutes:pim});
                        }
                    });
                } else {
                    if (msg.options.debug)
                        console.debug("clear alarm: " + name);
                    await browser.alarms.clear(name);
                }
            }
            await respond(true);
        });
        browser.runtime.sendMessage({command:"popup"});
    });

    window.addEventListener("pagehide", async (event) => {
        let name = alarmPrefix + "monitor";
        browser.runtime.sendMessage({command:"popdown", alarm:name});
    });

})();
