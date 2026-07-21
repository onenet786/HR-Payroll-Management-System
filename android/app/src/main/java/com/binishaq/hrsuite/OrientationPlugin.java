package com.binishaq.hrsuite;

import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OrientationPlugin")
public class OrientationPlugin extends Plugin {
    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode", "portrait");
        int orientation = "landscape".equals(mode)
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        getActivity().runOnUiThread(() -> {
            getActivity().setRequestedOrientation(orientation);
            JSObject result = new JSObject();
            result.put("mode", mode);
            call.resolve(result);
        });
    }
}
