VERSION= $(shell grep \"version\" manifest.json | sed "s/.*: \"\(.*\)\".*/\1/")
FILES=	manifest.json \
	background.js \
	icons \
	popup
IGNORE=	icons/autoresume-512.png


dist:
	# Create .zip instead of .xpi since it will need to be validated
	# and signed before it can be used as extension file.
	# zip updates an existing archive by default
	# -r = recurse
	# -Z = compression method
	# -D = no directory entries
	rm -f autoresume-$(VERSION).zip
	zip -r -Z deflate -D autoresume-$(VERSION).zip $(FILES) -x $(IGNORE)
