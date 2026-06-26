# top-of-the-flocks
Leaderboard for bird ringing data

## Overview

This is a Next.js application that provides a leaderboard for bird ringing data. The application uses:
- **Next.js** - React framework for production
- **Supabase** - PostgreSQL database and authentication
- **Vercel** - Hosting and deployment

## Prerequisites

- Node.js 20 or higher
- npm
- A Supabase account and project

## Scripts

### Running the app
- next:dev - Runs the app using the local database
- next:prod - Runs the app using the production database
- next:build - Builds the app using the dev database (useful for debugging odd reasons whi the build fails on vercel)
- db:local:start - starts the local databse
- db:local:console - opens a console onto the local database

### DB management
- db:schema:pull - ensures supabase/migrations contains an up to date history: avoids getting errors when trying to push a migration
- db:schema:apply - Applies schema changes to the local db and constructs a migration
- db:migration:push- pushes the prepared migration to prod
- db:sync:local - makes sure the local database is running the latest prod schema
- db:seed:local - populates the local database with some test data
- db:types - regenerates types based on the local database
- db:import:prod ${filepath} - imports the given demon csv file into prod
- db:import:local ${filepath} - imports the given demon csv file into prod
- db:diff - diffs the current local db against teh prod schema
### Quality
- lint - runs prettier and eslint
- type:check - runs the typescript checker
- type:check:open - runs the typescrtipt checker and opens any files with errors in cursor
- qa:bloat - prints a list of app files that have got rather large
- test - runs tests in watch mode
- test:nowatch - runs test not in watch mode
- qa - lints, checks types, runs test and checks for bloat

### CI
These are only run by vercel and will break locally as they don't do anything special to inject env vars
- start - starts the app
- build - builds the app

## Modifying the schema steps
1. Use `npm run db:local:console` to open the local db console and work in here
2. Once everything seems to work, run `npm run db:diff` to output the difference between prod and local
3. Modify the files in `supabase/schema` to reflect this and commit.
4. Run `npm run db:migration:prepare` to generate a migration
5. Run `npm run db:seed:local` to repopluate the local database and verify that everything still works
6. Check that the newest migration file in `supabase/migrations` looks sensible
7. Coordinate rolling out the application code that uses the schema changes and using `npm run db:migration:push`to push the schema changes, which will vary between features

