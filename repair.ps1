$migrations = Get-ChildItem -Path supabase/migrations/*.sql | Where-Object { $_.Name -notmatch "20261001000000" -and $_.Name -notmatch "ALL_MIGRATIONS" }

foreach ($migration in $migrations) {
    $migrationId = $migration.Name.Split('_')[0]
    Write-Host "Repairing $migrationId..."
    npx supabase migration repair --status applied $migrationId
}

Write-Host "Repair complete. Pushing new migration..."
npx supabase db push
