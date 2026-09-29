
// Original Morse Runner use two different Filter.
// Likely for performance reasons, the QuickAverage is used for the QSB filter.

export class QuickAvg {

    constructor() {
        this.FPoints = 128
        this.FPasses = 4
        this.Reset()
    }

    Filter(ARe, AIm) {
        let re = this._DoFilter(ARe, this.ReBufs)
        let im = this._DoFilter(AIm, this.ImBufs)

        this.PrevIdx = this.Idx
        this.Idx = (this.Idx + 1) % this.FPoints

        return { Re: re, Im: im }
    }

    Reset() {
        const number_of_buffers = this.FPasses + 1

        this.ReBufs = Array.from(Array(number_of_buffers), _ => new Float32Array(this.FPoints))
        this.ImBufs = Array.from(Array(number_of_buffers), _ => new Float32Array(this.FPoints))


        this.FScale = Math.pow(this.FPoints, -this.FPasses)
        this.Idx = 0
        this.PrevIdx = this.FPoints - 1
    }

    set passes(value) {
        this.FPasses = Math.max(1, Math.min(8, value))
        this.Reset()
    }

    set points(value) {
        this.FPoints = Math.max(1, value)
        this.Reset()
    }
    get points() {
        return this.FPoints
    }

    _DoFilter(V, Buffers) {
        let result = V
        for (let p = 1; p <= this.FPasses; p++) {
            V = result
            result = Buffers[p][this.PrevIdx] - Buffers[p - 1][this.Idx] + V
            Buffers[p - 1][this.Idx] = V
        }
        Buffers[this.FPasses][this.Idx] = result
        result *= this.FScale
        return result
    }
}
