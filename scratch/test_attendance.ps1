$res1 = Invoke-RestMethod -Uri "http://localhost:3000/api/attendance/student?limit=3" -Method Get
Write-Host "GET /api/attendance/student:"
Write-Host "Success:" $res1.success
Write-Host "Records:" $res1.data.Count
Write-Host "Summary:" ($res1.summary | ConvertTo-Json -Compress)

$body = '{"date":"2026-09-05"}'
$res2 = Invoke-RestMethod -Uri "http://localhost:3000/api/attendance/auto-absent" -Method Post -Body $body -ContentType "application/json"
Write-Host "POST /api/attendance/auto-absent:"
Write-Host ($res2 | ConvertTo-Json -Compress)
