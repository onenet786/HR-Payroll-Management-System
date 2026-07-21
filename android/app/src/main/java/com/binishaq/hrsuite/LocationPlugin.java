package com.binishaq.hrsuite;

import android.location.Address;
import android.location.Geocoder;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "LocationPlugin")
public class LocationPlugin extends Plugin {
    @PluginMethod
    public void reverseGeocode(PluginCall call) {
        Double latitude = call.getDouble("latitude");
        Double longitude = call.getDouble("longitude");
        if (latitude == null || longitude == null || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
            call.reject("Valid coordinates are required.");
            return;
        }

        Geocoder geocoder = new Geocoder(getContext(), Locale.getDefault());
        if (!Geocoder.isPresent()) {
            resolveAddress(call, null);
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            geocoder.getFromLocation(latitude, longitude, 1, new Geocoder.GeocodeListener() {
                @Override
                public void onGeocode(List<Address> addresses) {
                    resolveAddress(call, addresses == null || addresses.isEmpty() ? null : addresses.get(0));
                }

                @Override
                public void onError(String errorMessage) {
                    resolveAddress(call, null);
                }
            });
            return;
        }

        new Thread(() -> {
            try {
                @SuppressWarnings("deprecation")
                List<Address> addresses = geocoder.getFromLocation(latitude, longitude, 1);
                resolveAddress(call, addresses == null || addresses.isEmpty() ? null : addresses.get(0));
            } catch (Exception ignored) {
                resolveAddress(call, null);
            }
        }, "location-geocoder").start();
    }

    private void resolveAddress(PluginCall call, Address address) {
        JSObject result = new JSObject();
        String label = "";
        if (address != null) {
            label = address.getAddressLine(0);
            if (label == null || label.trim().isEmpty()) {
                label = join(address.getSubLocality(), address.getLocality(), address.getAdminArea(), address.getCountryName());
            }
        }
        result.put("address", label == null ? "" : label.trim());
        call.resolve(result);
    }

    private String join(String... parts) {
        StringBuilder value = new StringBuilder();
        for (String part : parts) {
            if (part == null || part.trim().isEmpty()) continue;
            if (value.length() > 0) value.append(", ");
            value.append(part.trim());
        }
        return value.toString();
    }
}
