### Flow:

- server.js starts (on restart/deploy)

- calls fetchAndSaveData() automatically

- which calls azureSqlService.fetchCombinedData()

- uses db_userclientid → gets token from Azure (UAMI)

- uses db_serverendpoint → connects to Azure SQL

- db_zoho → fetches vw_Zoho_Bills_Data (parallel) & db_returns → fetches vw_Shopify_Product_SKUs (parallel)

- combines on Product_Title

- saves to src/output/*.json
