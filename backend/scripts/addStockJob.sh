#backend\scripts\addStockJob.sh
#!/bin/bash
mysql -h localhost -u u1773579_kencrot -pHesoy@m90 -D u1773579_office -e "INSERT INTO jobs (task_name, status) SELECT 'stock', 'pending' WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE task_name = 'stock' AND status IN ('pending', 'processing'));"