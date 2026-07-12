#!/bin/sh
set -eu
pnpm exec prisma migrate deploy
pnpm db:seed
exec node dist/main.js
