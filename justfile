set allow-duplicate-recipes := true

# Display available commands
default:
    @just --list

# Install all dependencies
install:
    pnpm install

# Start the development server (API and Worker)
dev: db-up
    pnpm run dev

# Build the project
build:
    pnpm run build

# Run tests
test:
    pnpm run test

# Run tests in watch mode
test-watch:
    pnpm run test:watch

# Run linter
lint:
    pnpm run lint

# Fix linting errors
lint-fix:
    pnpm run lint:fix

# Run formatter
format:
    pnpm run format

# Run typechecker
typecheck:
    pnpm run typecheck

# Start required services (Postgres and Redis)
db-up:
    docker compose up -d

# Stop required services
db-down:
    docker compose down

# Generate database migrations
db-generate:
    pnpm run db:generate

# Apply database migrations
db-migrate:
    pnpm run db:migrate
