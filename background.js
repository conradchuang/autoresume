//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    // TODO: use local storage so background script need not be persistent
    var autoresumeIds = ["13"];

    function reloadDownloads() {
        let query = {"orderBy": ["-startTime"]};
        let allDownloads = browser.downloads.search(query);
        function show(dls) {
            // TODO: remove debug code
            dls = [{id:12, filename:"hello.png"},
                   {id:13, filename:"world.gif"}];
            msg = {command:"show", downloads:dls, auto:autoresumeIds};
            browser.runtime.sendMessage(msg);
        }
        allDownloads.then(show, onError);
    }

    function onError(error) {
        console.error("autoresume: " + error.message);
    }

    // console.log("init background script");
    browser.runtime.onMessage.addListener((msg) => {
        console.log("background received command: " + msg.command);
        console.log(msg);
        if (msg.command == "popup") {
            // Send "show" message with latest list of downloads.
            reloadDownloads();
        } else if (msg.command == "update") {
            // Remove download id from autoresume list if not selected.
            // Add if selected.
            let n = autoresumeIds.indexOf(msg.id);
            if (msg.selected) {
                if (n == -1)
                    autoresumeIds.push(msg.id);
            } else {
                if (n != -1)
                    autoresumeIds.splice(n, 1);
            }
        } else if (msg.command == "finished") {
            // Remove download id from autoresume list.
            let n = autoresumeIds.indexOf(msg.id);
            if (n != -1)
                autoresumeIds.splice(n, 1);
        }
    });

    // TODO: listen for download stopped/paused/failed events
    // and automatically resume if possible.

})();
