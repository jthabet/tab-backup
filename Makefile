# Phony targets are ones that are not actually files; they are just names for a recipe to be executed.
.PHONY: build build_extension sign-extension clean

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

# $$(...) passes the command substitution through to the shell; a single $ would be expanded by make.
sign-extension: build
	pnpm exec web-ext sign --api-key="$$(op read 'op://dev/Firefox add-on/username')" --api-secret="$$(op read 'op://dev/Firefox add-on/credential')" --channel=listed -s ./dist

clean:
	@echo "Cleaning web-ext-artifacts/*"
	rm -rf web-ext-artifacts