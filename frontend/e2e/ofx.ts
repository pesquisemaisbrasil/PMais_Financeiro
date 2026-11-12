/** Um OFX no estilo SGML dos bancos, só com dados FICTÍCIOS: [dia, valor, ID do banco, descrição]. */
export type OfxLine = [string, string, string, string];

export function ofx(...lines: OfxLine[]): Buffer {
  const body = lines
    .map(
      ([day, amount, id, memo]) =>
        `<STMTTRN>\n<TRNTYPE>OTHER\n<DTPOSTED>${day}120000[-3:BRT]\n<TRNAMT>${amount}\n<FITID>${id}\n<MEMO>${memo}\n</STMTTRN>\n`
    )
    .join("");
  return Buffer.from(
    "OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n" +
      "<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341\n<ACCTID>98765-4\n</BANKACCTFROM>" +
      `<BANKTRANLIST>\n${body}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n`,
    "latin1"
  );
}
