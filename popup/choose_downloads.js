//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    // console.info("autoresume: init popup script");

    function downloadClick(ev) {
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
        let oldDownloads = document.body.querySelectorAll(".autoresume");
        for (let dl of oldDownloads)
            dl.remove();
        let activeDownloads = document.body.querySelector(".active-downloads");
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
            if (auto.indexOf(dlId) != -1)
                checkbox.checked = true;
            checkbox.addEventListener("change", downloadClick);
            let label = document.createElement("label");
            let name = dl.filename.replace(/^.*[\\\/]/, '');
            label.textContent = ' ' + name + ' (' + dl.state + ')';
            let br = document.createElement("br");
            activeDownloads.appendChild(checkbox);
            activeDownloads.appendChild(label);
            activeDownloads.appendChild(br);
            count += 1;
        }
        if (count == 0) {
            let p = document.createElement("p");
            p.textContent = "No active downloads.";
            // p.className = "autoresume";
            activeDownloads.appendChild(p);
        }

        // Display option states
        document.getElementById("option-auto").checked = options.auto;
    }

    function optionAutoClick(ev) {
        let el = ev.target;
        let msg = {
            command: "option-auto",
            selected: el.checked,
        };
        browser.runtime.sendMessage(msg);
        // console.info("autoresume: sent update");
        // console.debug(msg);
    }

    document.getElementById("option-auto").addEventListener("change",
                                                            optionAutoClick);
    browser.runtime.onMessage.addListener((msg) => {
        console.info("autoresume: popup received command: " + msg.command);
        console.debug(msg);
        if (msg.command == "show") {
            showDownloads(msg.downloads, msg.auto, msg.options);
        }
    });
    browser.runtime.sendMessage({command:"popup"});

})();
