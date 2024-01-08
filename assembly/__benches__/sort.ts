const length = blackbox(99);
const size = blackbox((<usize>length) << alignof<f64>());
const array = new StaticArray<f64>(length);

for (let i = 0; i < length; ++i) {
    array[i] = Math.random();
}

// invariant: out must be `length` long
// @ts-ignore
@inline
function copy(out: StaticArray<f64>): void {
    memory.copy(changetype<usize>(out), changetype<usize>(array), size);
}

// @ts-ignore
@inline
function copySlice(from: StaticArray<f64>, fromStart: i32, to: StaticArray<f64>, toStart: i32, count: i32): void {
    memory.copy(
        changetype<usize>(to) + (<usize>toStart << alignof<f64>()),
        changetype<usize>(from) + (<usize>fromStart << alignof<f64>()),
        <usize>count << alignof<f64>()
    )
}

// @ts-ignore
@inline
function checkSort(arr: StaticArray<f64>): void {
    for (let i = 0; i < length - 1; ++i) {
        if (arr[i] > arr[i + 1]) {
            assert(false);
        }
    }
}

// @ts-ignore
@inline
function swap(arr: StaticArray<f64>, i: i32, j: i32): void {
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
}


const selectionArr = new StaticArray<f64>(length);

// @ts-ignore
@inline
function selectionSort(): void {
    for (let i = 0; i < length - 1; ++i) {
        let min = i;
        for (let j = i + 1; j < length; ++j) {
            if (selectionArr[j] < selectionArr[min]) {
                min = j;
            }
        }
        swap(selectionArr, i, min);
    }
}

// check selection sort
copy(selectionArr);
selectionSort();
checkSort(selectionArr);

const bubbleArr = new StaticArray<f64>(length);

// @ts-ignore
@inline
function bubbleSort(): void {
    for (let i = 0; i < length; ++i) {
        for (let j = 0; j < length - 1; ++j) {
            if (bubbleArr[j] > bubbleArr[j + 1]) {
                swap(bubbleArr, j, j + 1);
            }
        }
    }
}

// check bubble sort
copy(bubbleArr);
bubbleSort();
checkSort(bubbleArr);

const insertionArr = new StaticArray<f64>(length);

// @ts-ignore
@inline
function insertionSort(): void {
    for (let i = 1; i < length; ++i) {
        for (let j = i; j > 0; --j) {
            if (insertionArr[j] < insertionArr[j - 1]) {
                swap(insertionArr, j, j - 1);
            } else {
                break;
            }
        }
    }
}

// check insertion sort
copy(insertionArr);
insertionSort();
checkSort(insertionArr);

const mergeArr = new StaticArray<f64>(length);

// @ts-ignore
@inline
function merge(start: i32, mid: i32, end: i32): void {
    const left = mergeArr.slice<StaticArray<f64>>(start, mid + 1);
    const leftLength = left.length;
    const right = mergeArr.slice<StaticArray<f64>>(mid + 1, end + 1);
    const rightLength = right.length;

    let i = 0, j = 0;
    while (i < leftLength && j < rightLength) {
        if (left[i] < right[j]) {
            mergeArr[start + i + j] = left[i];
            ++i;
        } else {
            mergeArr[start + i + j] = right[j];
            ++j;
        }
    }

    copySlice(left, i, mergeArr, start + i + j, leftLength - i);
}

function mergeSort(start: i32 = 0, end: i32 = length - 1): void {
    if (start >= end) {
        return;
    }

    const mid = start + (end - start) / 2;
    mergeSort(start, mid);
    mergeSort(mid + 1, end);
    merge(start, mid, end);
}

// check merge sort
copy(mergeArr);
mergeSort();
checkSort(mergeArr);

const quickArr = new StaticArray<f64>(length);

// @ts-ignore
@inline
function partition(start: i32, end: i32): i32 {
    let pivot = quickArr[end];
    let i = start - 1;
   
    for (let j = start; j < end; j++) {
        if (quickArr[j] < pivot) {
            i++;
            swap(quickArr, i, j);
        }
    }
   
    swap(quickArr, i + 1, end);
    return i + 1;
}

function quickSort(start: i32 = 0, end: i32 = length - 1): void {
    if (start >= end) {
        return;
    }

    const pivot = partition(start, end);
    quickSort(start, pivot - 1);
    quickSort(pivot + 1, end);
}

// check quick sort
copy(quickArr);
quickSort();
checkSort(quickArr);

suite("sort", () => {
    bench("bubble sort", () => {
        copy(bubbleArr);
        bubbleSort();
    });

    bench("insertion sort", () => {
        copy(insertionArr);
        insertionSort();
    });

    bench("selection sort", () => {
        copy(selectionArr);
        selectionSort();
    });

    bench("merge sort", () => {
        copy(mergeArr);
        mergeSort();
    });

    bench("quick sort", () => {
        copy(quickArr);
        quickSort();
    });
});