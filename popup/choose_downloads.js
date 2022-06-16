function listenForEvents() {
	document.addEventListener("click", (e) => {
		let el = e.target;
		if (el.classList.contains("autoresume")) {
			// el.innerHTML = "Hello";
			let msg = {
				command: "update",
				selected: el.checked,
				id: el.value,
			};
			browser.runtime.sendMessage(msg);
		}
	});
}

function reloadDownloads() {
	let oldDownloads = document.body.querySelectorAll(".autoresume");
	for (let dl of oldDownloads)
		dl.remove();
	let query = {"orderBy": ["-startTime"]};
	let allDownloads = browser.downloads.search(query);
	allDownloads.then(showDownloads, onError);
}

function checkboxClick(ev) {
	let el = ev.target;
	console.log(el);
	// el.innerHTML = "Hello";
	let msg = {
		command: "update",
		selected: el.checked,
		id: el.value,
	};
	browser.runtime.sendMessage(msg);
	console.log("sent update");
	console.log(msg);
}

function showDownloads(downloads) {
	let activeDownloads = document.body.querySelector(".active-downloads");
	let count = 0;
	// TODO: remove debug code
	downloads = [{id:12, filename:"hello.png"},
		     {id:13, filename:"world.gif"}];
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
		// TODO: need to figure out whether box should be checked
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

function onError(error) {
	console.error(`autoresume: ${error.message}`);
}

listenForEvents();
reloadDownloads();
