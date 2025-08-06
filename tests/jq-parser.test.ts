/**
 * Tests for jq expression parsing with contact list data
 */

import { evaluateJqExpression } from '../src/lib/jq-parser';

// Sample kind 3 contact list event
const sampleContactListEvent = {
  id: "abc123",
  pubkey: "user123",
  created_at: 1640995200,
  kind: 3,
  tags: [
    ["p", "141d2053cb29535ad45aa9e865cdec492524f0ec0066496b98b7099daab5d658"],
    ["p", "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"],
    ["e", "someeventid123"],
    ["p", "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2"],
    ["t", "nostr"],
    ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
  ],
  content: "",
  sig: "signature"
};

describe('jq expression evaluation', () => {
  test('should extract pubkeys from simple tag array', () => {
    const simpleTags = [
      [
        "p",
        "141d2053cb29535ad45aa9e865cdec492524f0ec0066496b98b7099daab5d658"
      ],
      [
        "p", 
        "7d1b1794dea22d516dac697e2c5e3b39599b12b7c6b0ea7b136b1328c7a0844e"
      ],
      [
        "p",
        "6b0d4c8d9dc59e110d380b0429a02891f1341a0fa2ba1b1cf83a3db4d47e3964"
      ],
      [
        "p",
        "c1fe52f8f5f40415e8237711ae4369fd4ecf753c995b512f49a1b26b8da18569"
      ],
      [
        "p",
        "f648d9238a4541c10145f11d8532c529089bfa23c017c1b959c5c26d820d7bb9"
      ]
    ];

    const expression = '.[] | select(.[0] == "p") | .[1]';
    const result = evaluateJqExpression(expression, simpleTags);
    
    const expectedPubkeys = [
      "141d2053cb29535ad45aa9e865cdec492524f0ec0066496b98b7099daab5d658",
      "7d1b1794dea22d516dac697e2c5e3b39599b12b7c6b0ea7b136b1328c7a0844e",
      "6b0d4c8d9dc59e110d380b0429a02891f1341a0fa2ba1b1cf83a3db4d47e3964", 
      "c1fe52f8f5f40415e8237711ae4369fd4ecf753c995b512f49a1b26b8da18569",
      "f648d9238a4541c10145f11d8532c529089bfa23c017c1b959c5c26d820d7bb9"
    ];
    
    expect(result).toEqual(expectedPubkeys);
  });

  test('should extract pubkeys from contact list using .tags[] | select(.[0] == "p") | .[1]', () => {
    const expression = '.tags[] | select(.[0] == "p") | .[1]';
    const result = evaluateJqExpression(expression, sampleContactListEvent);
    
    const expectedPubkeys = [
      "141d2053cb29535ad45aa9e865cdec492524f0ec0066496b98b7099daab5d658",
      "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d", 
      "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2",
      "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"
    ];
    
    expect(result).toEqual(expectedPubkeys);
  });
  
  test('should access tags property', () => {
    const result = evaluateJqExpression('.tags', sampleContactListEvent);
    expect(result).toEqual(sampleContactListEvent.tags);
  });
  
  test('should iterate over tags array', () => {
    const result = evaluateJqExpression('.tags[]', sampleContactListEvent);
    expect(result).toEqual(sampleContactListEvent.tags);
  });
  
  test('should filter p tags only', () => {
    const result = evaluateJqExpression('.tags[] | select(.[0] == "p")', sampleContactListEvent);
    const expectedPTags = [
      ["p", "141d2053cb29535ad45aa9e865cdec492524f0ec0066496b98b7099daab5d658"],
      ["p", "3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d"],
      ["p", "82341f882b6eabcd2ba7f1ef90aad961cf074af15b9ef44a09f9d2a8fbfbe6a2"],
      ["p", "f7234bd4c1394dda46d09f35bd384dd30cc552ad5541990f98844fb06676e9ca"]
    ];
    
    expect(result).toEqual(expectedPTags);
  });
  
  test('should extract first element of tag arrays', () => {
    const result = evaluateJqExpression('.tags[] | .[0]', sampleContactListEvent);
    const expectedFirstElements = ["p", "p", "e", "p", "t", "p"];
    
    expect(result).toEqual(expectedFirstElements);
  });
});