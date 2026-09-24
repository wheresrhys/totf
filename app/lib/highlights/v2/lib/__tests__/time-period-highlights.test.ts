import { describe, it, expect, vi, beforeEach } from 'vitest';
// mock getHighlightsWithinTimeWindow
vi.mock('../highlight-generator', () =>({
  getHighlightsWithinTimeWindow: vi.fn()
}))
import { getHighlightsWithinTimeWindow } from '../highlight-generator';

describe('getHighlightsWithinTimeWindow', () => {
  describe('data sources', () => {
    describe('day', () => {
      it("combines all time, year and month highlights", async () => {

      });
      it("filters out highlights that do not occur on the relevant day", async () => {

      });
    })
    describe('month', () => {
      it("combines all time and year highlights when calculating for a month", async () => {

      });
      it("filters out highlights that do not occur in the relevant month", async () => {

      });
    })
    describe('year', () => {
      it("fetches all time highlights when calculating for a year", async () => {

      });
      it("filters out highlights that do not occur in the relevant year", async () => {

      });
    })
  })
  describe('filtering based on significance', () => {
    it("remove lowest positioned of two similar highlights", async () => {

    });
    it("remove year-scoped hihglight when all time scoped exists", async () => {

    });
    it("remove month-scoped hihglight when all time scoped exists", async () => {

    });
    it("remove when both are tied", async () => {

    });
    it("remove when both are not tied", async () => {

    });
    it("remove when higher scoped is not tied and local scoped is tied", async () => {

    });
    it("don't remove when higher scoped is tied and local scoped is not tied", async () => {

    });
    it("don't remove year-scoped highlight when month-scoped exists", async () => {

    });
    it("don't remove month-scoped hihglight when year-scoped exists", async () => {

    });
    it("don't remove where type doesn't match", async () => {

    });
    it("don't remove wherer category doesn't match", async () => {

    });
    it("don't remove where species doesn't match", async () => {

    });
  })
  describe('combining highlights', () => {
    it("returns the correct shape for a combined highlight", async () => {

    });
    it("combines highlights with exact same descriptor (no species)", async () => {

    });
    it("combines highlights with exact same descriptor (with species)", async () => {

    });
    it("doesn't combine highlights with and without species", async () => {

    });
    it("doesn't combine highlights of different type", async () => {

    });
    it("doesn't combine highlights of different category", async () => {

    });
    it("doesn't combine highlights of different unit", async () => {

    });
    describe('sorting highlights', () => {
      it("when position is equal sorts all time scoped highlights ahead of month-scoped ahead of year-scoped highlights", async () => {

      });
      it("sorts highlights of better position (i.e.lower number) first (disregarding time period scoping)", async () => {

      });
    })
    it("exposes the best position as bestPosition", async () => {

    });
  })
  describe('sorting combined highlights', () => {
    it("sorts by category first, regardless of other properties", async () => {

    });
    it("within a category, sorts items scoped to species below unscoped, regardless of other properties", async () => {

    });
    it("within a category, sorts highlights of better position(i.e.lower number) first(disregarding time period scoping)", async () => {

    });
    it("within a category, when bestPosition is equal sorts by the scope of the first nested highlight", async () => {

    });
  })

})
