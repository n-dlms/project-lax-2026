package za.co.projectlax.app;

import com.getcapacitor.BridgeActivity;
import androidx.activity.OnBackPressedCallback;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) {
                    finish();
                    return;
                }
                bridge.getWebView().evaluateJavascript(
                    "Boolean(window.laxHandleAndroidBack && window.laxHandleAndroidBack())",
                    result -> { if (!"true".equals(result)) finish(); }
                );
            }
        });
    }
}
