import { defineComponent, h } from 'vue';

export const IconChart = defineComponent({
  name: 'IconChart',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M896 256H128v64h768v-64zm0 192H128v64h768v-64zm0 192H128v64h768v-64zm-640 192H128v64h128v-64zm256 0H384v64h128v-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
