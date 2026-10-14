/* サーバー連携の設定。空のままなら、v6と同じく端末内だけで動く(ログインなし)。
   Supabase に反映したあと、手順書の「2. HTMLに入れる値」で控えた値を入れる。
   apiUrl : https://xxxx.supabase.co/functions/v1/clever-api
   apiKey : sb_publishable_...(公開用キーのみ。secret / service_role は絶対に入れない) */
window.OSAKA_CONFIG = { apiUrl: "https://dhzdygqopmnjbggfyxmd.supabase.co/functions/v1/clever-api", apiKey: "sb_publishable_knhDKrqz3P33aPT8curHsA_qTbVhyjU" };
