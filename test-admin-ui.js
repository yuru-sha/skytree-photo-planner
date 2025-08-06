const { chromium } = require('playwright');

async function testAdminLocationCreate() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    console.log('1. 管理画面にアクセス...');
    await page.goto('http://localhost:3000/admin');
    
    // ログインページかどうか確認
    await page.waitForSelector('body', { timeout: 5000 });
    const title = await page.title();
    console.log(`ページタイトル: ${title}`);
    
    // ログインが必要な場合はログイン
    const loginButton = page.locator('button:has-text("ログイン")').first();
    const isLoginPage = await loginButton.count() > 0;
    
    if (isLoginPage) {
      console.log('2. ログイン中...');
      // フィールドをクリアして入力
      await page.fill('input[name="username"], input[type="text"]', '');
      await page.fill('input[name="username"], input[type="text"]', 'admin');
      await page.fill('input[name="password"], input[type="password"]', '');
      await page.fill('input[name="password"], input[type="password"]', 'admin123');
      await loginButton.click();
      
      // ログイン後のページ遷移を待機
      await page.waitForNavigation({ waitUntil: 'networkidle' });
      console.log(`ログイン後の URL: ${page.url()}`);
    }
    
    console.log('3. 管理画面のナビゲーション確認...');
    // 管理画面のメインページに移動
    const currentUrl = page.url();
    console.log(`現在の URL: ${currentUrl}`);
    
    // 管理者メニューまたは地点管理に移動
    const adminLink = page.locator('a:has-text("管理"), a:has-text("Admin"), a[href*="admin"]').first();
    if (await adminLink.count() > 0) {
      await adminLink.click();
      await page.waitForTimeout(1000);
    }
    
    // 地点管理メニューを探す
    const locationManagementLink = page.locator('a:has-text("地点"), a:has-text("Location"), button:has-text("地点")').first();
    if (await locationManagementLink.count() > 0) {
      console.log('4. 地点管理画面に移動...');
      await locationManagementLink.click();
      await page.waitForTimeout(1000);
    }
    
    // 新規地点作成ボタンを探す
    const newLocationButton = page.locator('button:has-text("新規"), button:has-text("追加"), button:has-text("作成")').first();
    if (await newLocationButton.count() > 0) {
      console.log('5. 新規地点作成フォームを開く...');
      await newLocationButton.click();
      await page.waitForTimeout(1000);
    }
    
    console.log('6. フォームフィールドを確認...');
    const nameField = page.locator('input[name="name"], input[placeholder*="名"]').first();
    const latField = page.locator('input[name="latitude"], input[placeholder*="緯度"]').first();
    const lngField = page.locator('input[name="longitude"], input[placeholder*="経度"]').first();
    const elevField = page.locator('input[name="elevation"], input[placeholder*="標高"]').first();
    
    const hasNameField = await nameField.count() > 0;
    const hasLatField = await latField.count() > 0;
    const hasLngField = await lngField.count() > 0;
    const hasElevField = await elevField.count() > 0;
    
    console.log(`フォームフィールド存在確認:`);
    console.log(`- 名前フィールド: ${hasNameField}`);
    console.log(`- 緯度フィールド: ${hasLatField}`);
    console.log(`- 経度フィールド: ${hasLngField}`);
    console.log(`- 標高フィールド: ${hasElevField}`);
    
    if (hasNameField && hasLatField && hasLngField && hasElevField) {
      console.log('7. テストデータを入力...');
      await nameField.fill('サンシャイン 60 展望台（Playwright テスト）');
      await latField.fill('35.7295');
      await lngField.fill('139.7196');
      await elevField.fill('251');
      
      // 都道府県フィールド
      const prefField = page.locator('select[name="prefecture"], input[name="prefecture"]').first();
      if (await prefField.count() > 0) {
        const tagName = await prefField.evaluate(el => el.tagName.toLowerCase());
        if (tagName === 'select') {
          await prefField.selectOption('東京都');
        } else {
          await prefField.fill('東京都');
        }
      }
      
      // その他のフィールド
      const descField = page.locator('textarea[name="description"], input[name="description"]').first();
      if (await descField.count() > 0) {
        await descField.fill('Playwright による自動テスト');
      }
      
      const accessField = page.locator('input[name="accessInfo"], textarea[name="accessInfo"]').first();
      if (await accessField.count() > 0) {
        await accessField.fill('池袋駅東口から徒歩 8 分');
      }
      
      const parkingField = page.locator('input[name="parkingInfo"], textarea[name="parkingInfo"]').first();
      if (await parkingField.count() > 0) {
        await parkingField.fill('地下駐車場利用可能');
      }
      
      console.log('8. フォームを送信...');
      const submitButton = page.locator('button[type="submit"], button:has-text("作成"), button:has-text("登録")').first();
      await submitButton.click();
      
      // 結果を待機
      await page.waitForTimeout(3000);
      
      // 成功メッセージまたはエラーメッセージを確認
      const successMessage = page.locator(':has-text("成功"), :has-text("作成され"), :has-text("登録され")').first();
      const errorMessage = page.locator(':has-text("エラー"), :has-text("失敗"), .error').first();
      
      const hasSuccess = await successMessage.count() > 0;
      const hasError = await errorMessage.count() > 0;
      
      console.log(`結果:`);
      console.log(`- 成功メッセージ: ${hasSuccess}`);
      console.log(`- エラーメッセージ: ${hasError}`);
      
      if (hasSuccess) {
        console.log('✅ 地点登録成功！');
        
        // 登録された地点の詳細を確認
        const locationDetails = await page.locator('text=/仰角|elevation/i').textContent().catch(() => null);
        console.log(`地点詳細: ${locationDetails}`);
        
      } else if (hasError) {
        const errorText = await errorMessage.textContent();
        console.log(`❌ エラー発生: ${errorText}`);
      } else {
        console.log('⚠️ 結果が不明');
        console.log(`現在の URL: ${page.url()}`);
      }
    } else {
      console.log('❌ 必要なフォームフィールドが見つかりません');
    }
    
    // スクリーンショットを保存
    await page.screenshot({ path: 'admin-test-result.png', fullPage: true });
    console.log('スクリーンショットを保存: admin-test-result.png');
    
  } catch (error) {
    console.error('テスト中にエラーが発生:', error);
    await page.screenshot({ path: 'admin-test-error.png', fullPage: true });
  } finally {
    await browser.close();
  }
}

// テスト実行
testAdminLocationCreate().catch(console.error);