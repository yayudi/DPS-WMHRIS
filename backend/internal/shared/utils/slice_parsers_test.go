package utils

import (
	"reflect"
	"testing"
)

func TestParseIntArray(t *testing.T) {
	if got := ParseIntArray(nil); got != nil {
		t.Errorf("expected nil for empty input, got %v", got)
	}

	got := ParseIntArray([]string{"10", " 25 ", "invalid", "-3", ""})
	want := []int{10, 25, -3}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ParseIntArray() = %v, want %v", got, want)
	}
}

func TestSliceMapAndFilter(t *testing.T) {
	if Map[int, int](nil, func(v int) int { return v }) != nil {
		t.Error("expected nil from Map on nil slice")
	}
	if Filter[int](nil, func(v int) bool { return true }) != nil {
		t.Error("expected nil from Filter on nil slice")
	}

	nums := []int{1, 2, 3, 4, 5}
	doubled := Map(nums, func(v int) int { return v * 2 })
	if !reflect.DeepEqual(doubled, []int{2, 4, 6, 8, 10}) {
		t.Errorf("unexpected Map result: %v", doubled)
	}

	evens := Filter(nums, func(v int) bool { return v%2 == 0 })
	if !reflect.DeepEqual(evens, []int{2, 4}) {
		t.Errorf("unexpected Filter result: %v", evens)
	}
}
