import { test, expect } from '@playwright/test';

test('Recording - codegen-1755535042142', async ({ page }) => {
  await page.goto('https://www.google.com/');
  
  await page.goto('https://www.google.com/');
  await page.goto('https://accounts.zoho.com/signin?servicename=ZohoInventory&signupurl=https://www.zoho.com/us/inventory/signup/index.html');
  await page.goto('https://inventory.zoho.com/home');
  await page.goto('https://inventory.zoho.com/app/893870319');
  await page.goto('https://inventory.zoho.com/app/893870319#/home/gettingstarted');
  await page.click('span'); // 
                Reports
     
  await page.goto('https://inventory.zoho.com/app/893870319#/reports?report_group=favourites');
  await page.click('span'); // Inventory Summary
  await page.goto('https://inventory.zoho.com/app/893870319#/reports/inventorysummary?filter_by=ThisYear&group_by=%5B%7B%22field%22%3A%22none%22%2C%22group%22%3A%22report%22%7D%5D&select_columns=%5B%7B%22field%22%3A%22item_name%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22sku%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_ordered%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_purchased%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_sold%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_demanded%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_available_for_sale%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22quantity_in_transit%22%2C%22group%22%3A%22report%22%7D%2C%7B%22field%22%3A%22unit%22%2C%22group%22%3A%22item%22%7D%5D&show_actual_stock=true&sort_column=item_name&sort_order=A&stock_on_hand_filter=AvailableStock&to_date=2025-12-31');

});

// Session: codegen-1755535042142
// Duration: 62s
// Actions: 9
