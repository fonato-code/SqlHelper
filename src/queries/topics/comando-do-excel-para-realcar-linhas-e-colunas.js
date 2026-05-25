(function (root) {
  'use strict';
  var SqlHelp = root.SqlHelp = root.SqlHelp || {};
  SqlHelp._qt_comando_do_excel_para_realcar_linhas_e_colunas = {
    id: "comando-do-excel-para-realcar-linhas-e-colunas",
    title: "Comando do Excel para realçar linhas e colunas",
    tags: [],
    blocks: [
      { type: 'md', content: `\`\`\` VB
        Private Sub Worksheet_SelectionChange(ByVal Target As Range)
            Cells.FormatConditions.Delete

            With Target.EntireRow.FormatConditions.Add(Type:=xlExpression, Formula1:="=VERDADEIRO")
                .Interior.Color = RGB(117, 117, 117)
            End With

            With Target.EntireColumn.FormatConditions.Add(Type:=xlExpression, Formula1:="=VERDADEIRO")
                .Interior.Color = RGB(117, 117, 117)
            End With
        End Sub

\`\`\`` }
    ]
  };
})(typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : this);
