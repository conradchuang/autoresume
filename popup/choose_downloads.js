//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    function checkboxClick(ev) {
        let el = ev.target;
        // el.innerHTML = "Hello";
        let msg = {
            command: "update",
            selected: el.checked,
            id: el.value,
        };
        browser.runtime.sendMessage(msg);
        // console.log("sent update");
        // console.log(msg);
    }

    function showDownloads(downloads, auto) {
        let oldDownloads = document.body.querySelectorAll(".autoresume");
        for (let dl of oldDownloads)
            dl.remove();
        let activeDownloads = document.body.querySelector(".active-downloads");
        let count = 0;
        for (let dl of downloads) {
            console.log(dl);
            let dlId = dl.id.toString();
            // If download is finished, we should not display it.
            if (dl.state == "complete") {
                browser.runtime.sendMessage({command:"finished",
                                 id:dlId});
                continue;
            }
            let checkbox = document.createElement("input");
            checkbox.setAttribute("type", "checkbox");
            checkbox.value = dlId;
            checkbox.className = "autoresume";
            if (auto.indexOf(dlId) != -1)
                checkbox.checked = true;
            checkbox.addEventListener("change", checkboxClick);
            let label = document.createElement("label");
            label.innerHTML = dl.filename.replace(/^.*[\\\/]/, '');
            let br = document.createElement("br");
            activeDownloads.appendChild(checkbox);
            activeDownloads.appendChild(label);
            activeDownloads.appendChild(br);
            count += 1;
        }
        if (count == 0) {
            let p = document.createElement("p");
            p.innerHTML = "No active downloads.";
            // p.className = "autoresume";
            activeDownloads.appendChild(p);
        }
    }

    // console.log("init popup script");
    browser.runtime.onMessage.addListener((msg) => {
        console.log("popup received command: " + msg.command);
        console.log(msg);
        if (msg.command == "show") {
            showDownloads(msg.downloads, msg.auto);
        }
    });
    browser.runtime.sendMessage({command:"popup"});

})();
