import Test from "node:test";
import Assert from "node:assert/strict";
import { Summarize_Match_Sessions, Validate_Match_Session } from "../assets/matchlab-utils.mjs";

function Session(Started, Minutes, Good, Attempts, Interest = "roleplay") {
  return {
    started: Started, ended: Started + Minutes * 60,
    country: "IL", interest: Interest, mode: "video", filter: "any", good: Good, attempts: Attempts,
  };
}

Test("validates only bounded, anonymous aggregate session records", () => {
  Assert.equal(Validate_Match_Session(Session(1000000, 30, 3, 8)), true);
  Assert.equal(Validate_Match_Session(Session(1000000, 0, 1, 1)), false);
  Assert.equal(Validate_Match_Session(Session(1000000, 30, 9, 8)), false);
  Assert.equal(Validate_Match_Session({ ...Session(1000000, 30, 3, 8), interest: "x".repeat(70) }), false);
});

Test("calculates good matches per hour and conversion honestly", () => {
  const Data = Summarize_Match_Sessions([Session(1000000, 60, 5, 20)]);
  Assert.equal(Data.Matches_Per_Hour, 5);
  Assert.equal(Data.Conversion_Rate, 25);
  Assert.equal(Data.Good_Matches, 5);
  Assert.equal(Data.Duration_Seconds, 3600);
});

Test("does not promote an interest from a single lucky session", () => {
  const First = Session(1000000, 30, 6, 10, "travel");
  Assert.equal(Summarize_Match_Sessions([First]).Best_Interest, null);
  const Second = Session(1005000, 30, 2, 6, "travel");
  const Third = Session(1010000, 10, 7, 8, "roleplay");
  const Summary = Summarize_Match_Sessions([First, Second, Third]);
  Assert.equal(Summary.Best_Interest.Interest, "travel");
  Assert.equal(Summary.Best_Interest.Sessions, 2);
});

Test("empty sessions do not invent rates", () => {
  const Summary = Summarize_Match_Sessions([]);
  Assert.equal(Summary.Sessions, 0);
  Assert.equal(Summary.Matches_Per_Hour, null);
  Assert.equal(Summary.Conversion_Rate, null);
  Assert.equal(Summary.Best_Interest, null);
});
