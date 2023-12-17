# Phony targets are ones that are not actually files; they are just names for a recipe to be executed.
.PHONY: build build_extension clean

# Define the default target. When you run just "make", this is what it will do.
all: clean build_extension

# Define a target for building your React project.
build:
	@echo "Building the React project..."
	pnpm build

# Define a target for building the extension with web-ext.
build_extension: build
	@echo "Building the extension with web-ext..."
	pnpm build-extension

update_manifest:
	op inject -f -i dist/manifest.json -o dist/manifest.json

sign-extension:
	web-ext sign --api-key=$(op read "op://dev/Firefox add-on/username") --api-secret=$(op read "op://dev/Firefox add-on/credential") --id=$(op read "op://dev/Firefox add-on/add more/UUID") --channel=unlisted -s ./dist

clean:
	@echo "Cleaning web-ext-artifacts/*"
	rm -f web-ext-artifacts/*