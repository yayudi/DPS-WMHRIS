package domain

import "testing"

func TestDomainPreferenceAndUserUpdateParams(t *testing.T) {
	pref := NewDefaultUserPreference(15)
	if pref.UserID != 15 || pref.Locale != DefaultPreferenceLocale || pref.Theme != DefaultPreferenceTheme {
		t.Errorf("unexpected default preference: %+v", pref)
	}
	if !IsValidDateFormat("YYYY-MM-DD") || IsValidDateFormat("INVALID") {
		t.Error("unexpected IsValidDateFormat result")
	}

	var params UserUpdateParams
	if params.HasUpdates() {
		t.Error("expected empty UserUpdateParams.HasUpdates() to be false")
	}
	name := "budi"
	params.Username = &name
	if !params.HasUpdates() {
		t.Error("expected UserUpdateParams.HasUpdates() to be true when Username is set")
	}
}
