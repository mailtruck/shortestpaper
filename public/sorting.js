(function($) {
  var host = function() {
    return location.host.replace(/8080/, '8081');
  };

  var keys = [];
  $('#bookmark_list > .tableViewCell').each(function() {
    keys.push($(this).attr('key'));
  });

  $.getJSON(['http://', host(), '/counts.json?keys=', keys.join(), '&callback=?'].join(''), function(json) {
    var bml = $('#bookmark_list');
    var stories = [];
    $('.tableViewCell', bml).each(function() {
      var t = $(this);
      var count = json[t.attr('key')];
      t.attr('count', count);
      $('.secondaryControls', t).append("<span class='host'>" + count + ' words</span>');
      t.removeClass('tableViewCellLast');
      t.removeClass('tableViewCellFirst');
      stories.push(this);
    });

    stories.sort(function(l, r) {
      // They are already ints in the json, so use that.
      return json[$(l).attr('key')] - json[$(r).attr('key')];
    });

    bml.empty();

    $.each(stories, function() {
      bml.append($(this));
    });

    $('.tableViewCell:first', bml).addClass('tableViewCellFirst');
    $('.tableViewCell:last', bml).addClass('tableViewCellLast');
  });
})(jQuery.noConflict());