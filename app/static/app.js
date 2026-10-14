// Mostra o valor da nota escolhida ao lado das estrelas
document.querySelectorAll('.star-input').forEach(function (fs) {
  var out = fs.querySelector('.star-value');
  function fmt(v) { return (v / 2).toFixed(1).replace('.', ',') + ' estrela' + (v === 2 ? '' : 's'); }
  fs.addEventListener('change', function (e) {
    if (e.target.name === 'half_stars') out.textContent = fmt(parseInt(e.target.value, 10));
  });
  fs.querySelectorAll('label').forEach(function (lbl) {
    var input = document.getElementById(lbl.htmlFor);
    lbl.addEventListener('mouseenter', function () { out.textContent = fmt(parseInt(input.value, 10)); });
    lbl.addEventListener('mouseleave', function () {
      var checked = fs.querySelector('input:checked');
      out.textContent = checked ? fmt(parseInt(checked.value, 10)) : 'sem nota';
    });
  });
});
