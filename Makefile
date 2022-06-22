VERSION= $(shell grep \"version\" manifest.json | sed "s/.*: \"\(.*\)\".*/\1/")
FILES=	manifest.json \
	background.js \
	icons \
	popup
IGNORE=	icons/autoresume-512.png


dist:
	# zip updates an existing archive by default
	# -r = recurse
	# -Z = compression method
	# -D = no directory entries
	rm -f autoresume-$(VERSION).xpi
	zip -r -Z deflate -D autoresume-$(VERSION).xpi $(FILES) -x $(IGNORE)
