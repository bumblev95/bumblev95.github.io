package com.bumblevai.thenus.test;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Writes only the explicitly exported book to a destination selected by its owner. */
@CapacitorPlugin(name = "Keepsake")
public class KeepsakePlugin extends Plugin {
    private volatile boolean saving = false;

    @PluginMethod
    public void save(PluginCall call) {
        String data = call.getString("data");
        String mime = call.getString("mimeType");
        String filename = call.getString("filename", "Then-Us-Memory-Book.pdf");
        if (saving) { call.reject("이미 저장 중이에요.", "BUSY"); return; }
        if (data == null || data.isEmpty() || data.length() > 100_000_000 ||
            !("application/pdf".equals(mime) || "text/html".equals(mime)) ||
            filename.contains("/") || filename.contains("\\") || filename.length() > 120) {
            call.reject("저장할 파일을 확인해 주세요.", "INVALID_FILE"); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, filename);
        saving = true;
        try { startActivityForResult(call, intent, "saveResult"); }
        catch (Exception e) { saving = false; call.reject("저장 위치 선택 창을 열지 못했어요.", "SAVE_FAILED"); }
    }

    @ActivityCallback
    private void saveResult(PluginCall call, ActivityResult result) {
        if (call == null) { saving = false; return; }
        Intent intent = result.getData();
        Uri uri = intent == null ? null : intent.getData();
        if (result.getResultCode() != Activity.RESULT_OK || uri == null) {
            saving = false; call.reject("저장을 취소했어요.", "CANCELLED"); return;
        }
        // Base64 decoding and file I/O run off the UI thread. No private temporary book is created.
        bridge.execute(() -> {
            try (OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (stream == null) throw new java.io.IOException("No output stream");
                byte[] bytes = Base64.decode(call.getString("data", ""), Base64.DEFAULT);
                stream.write(bytes); stream.flush();
                JSObject value = new JSObject(); value.put("saved", true); call.resolve(value);
            } catch (Exception e) { call.reject("파일을 저장하지 못했어요. 다시 시도해 주세요.", "SAVE_FAILED"); }
            finally { saving = false; }
        });
    }
}
