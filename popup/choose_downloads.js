//
// vim: set expandtab ts=4 sw=4:
//

(function() {

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
            let checkbox = document.createElement("input");
            checkbox.setAttribute("type", "checkbox");
            checkbox.value = dlId;
            checkbox.className = "autoresume";
            if (dl.canResume.current) {
                checkbox.checked = auto[dlId];
                checkbox.disabled = false;
                checkbox.addEventListener("change", downloadCB);
            } else {
                checkbox.checked = false;
                checkbox.disabled = true;
            }
            let img = document.createElement("img");
            img.className = "download-state";
            if (dl.state == "in_progress")
                img.src = "../icons/status-running.png";
            else
                img.src = "../icons/status-stopped.png";
            let label = document.createElement("label");
            let filename = dl.filename.replace(/^.*[\\\/]/, '');
            let br = document.createElement("br");
            activeDownloads.appendChild(checkbox);
            activeDownloads.appendChild(img);
            activeDownloads.appendChild(label);
            if (options.monitorInterval) {
                // Estimate the download rate and time remaining
                // using the overall rate so far
                let now = new Date();
                let start = new Date(dl.startTime);
                let dlTime = (now - start) / 1000;
                let dlRate = dl.bytesReceived / dlTime;    // B/sec
                let msg = filename + " (";
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
                msg += ")";
                let rate = document.createElement("span");
                rate.textContent = msg;
                activeDownloads.appendChild(rate);
            } else {
                label.textContent = filename;
            }
            activeDownloads.appendChild(br);
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

        browser.runtime.onMessage.addListener((msg) => {
            // console.info("autoresume: popup received command: " +
            //              msg.command);
            // console.debug(msg);
            if (msg.command == "show-downloads")
                showDownloads(msg.downloads, msg.auto, msg.options);
        });
        browser.runtime.sendMessage({command:"popup"});
    });

})();
